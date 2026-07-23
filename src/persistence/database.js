import { applyPatchMap, createPatchMap } from './patches.js';
import {
  clone,
  createDefaultDatabase,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_DATABASE,
  MAX_IMPORT_BYTES,
  migrateDatabase,
  normalizeDatabase,
  UnsupportedSchemaVersionError,
  validateImportedDatabase
} from './schema.js';

export {
  createDefaultDatabase,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_DATABASE,
  MAX_IMPORT_BYTES,
  normalizeDatabase,
  validateImportedDatabase
};

export const DATABASE_STORAGE_KEY = 'fluxoturno_db';
export const DATABASE_STORAGE_PREFIX = `${DATABASE_STORAGE_KEY}:user:`;
export const DATABASE_QUEUE_PREFIX = `${DATABASE_STORAGE_KEY}:queue:`;
export const DATABASE_RECOVERY_PREFIX = `${DATABASE_STORAGE_KEY}:recovery:`;
export const LEGACY_OWNER_KEY = `${DATABASE_STORAGE_KEY}:legacy-owner`;

export function getUserStorageKey(userId) {
  return `${DATABASE_STORAGE_PREFIX}${userId}`;
}

export function getQueueStorageKey(userId) {
  return `${DATABASE_QUEUE_PREFIX}${userId}`;
}

export function getRecoveryStorageKey(userId) {
  return `${DATABASE_RECOVERY_PREFIX}${userId}`;
}

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  return JSON.parse(raw);
}

function createOperationId(now, randomUUID) {
  const random = randomUUID?.() || Math.random().toString(36).slice(2);
  return `op_${now()}_${random}`;
}

export function createDatabaseRepository({
  localStorage,
  remoteStore,
  onError = () => {},
  onSyncState = () => {},
  now = () => Date.now(),
  randomUUID = () => globalThis.crypto?.randomUUID?.()
}) {
  const contexts = new Map();
  const subscriptions = new Map();

  function contextFor(userId) {
    if (!contexts.has(userId)) {
      contexts.set(userId, {
        baseline: {},
        lastLocal: null,
        queue: [],
        loaded: false,
        blocked: false,
        flushPromise: null,
        connectionUnsubscribe: null
      });
    }
    return contexts.get(userId);
  }

  function notify(userId, status, context = contextFor(userId)) {
    onSyncState({ userId, status, pending: context.queue.length, blocked: context.blocked });
  }

  function writeJson(key, value, phase) {
    try {
      localStorage?.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      onError({ phase, error });
      return false;
    }
  }

  function readJson(key, fallback, phase) {
    try {
      return safeParse(localStorage?.getItem(key), fallback);
    } catch (error) {
      onError({ phase, error });
      return fallback;
    }
  }

  function loadQueue(userId) {
    const queue = readJson(getQueueStorageKey(userId), [], 'queue-read');
    return Array.isArray(queue) ? queue.filter(item => item?.id && item?.patches) : [];
  }

  function persistQueue(userId, context) {
    return writeJson(getQueueStorageKey(userId), context.queue, 'queue-write');
  }

  function claimLegacyCache(userId) {
    const scopedKey = getUserStorageKey(userId);
    const scoped = readJson(scopedKey, null, 'local-read');
    if (scoped) return scoped;

    const legacy = readJson(DATABASE_STORAGE_KEY, null, 'legacy-read');
    if (!legacy) return null;
    const owner = localStorage?.getItem(LEGACY_OWNER_KEY);
    if (owner && owner !== userId) return null;

    try {
      if (!owner) localStorage?.setItem(LEGACY_OWNER_KEY, userId);
      writeJson(scopedKey, legacy, 'local-write');
      return legacy;
    } catch (error) {
      onError({ phase: 'legacy-claim', error });
      return null;
    }
  }

  function readLocal(userId) {
    try {
      const cached = claimLegacyCache(userId);
      return cached ? normalizeDatabase(cached) : null;
    } catch (error) {
      onError({ phase: 'local-read', error });
      return null;
    }
  }

  function writeLocal(userId, data) {
    return writeJson(getUserStorageKey(userId), data, 'local-write');
  }

  function enqueue(userId, patches, kind = 'change') {
    if (Object.keys(patches).length === 0) return null;
    const context = contextFor(userId);
    const operation = {
      id: createOperationId(now, randomUUID),
      kind,
      createdAt: new Date(now()).toISOString(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      patches
    };
    context.queue.push(operation);
    persistQueue(userId, context);
    return operation;
  }

  async function flushQueue(userId) {
    const context = contextFor(userId);
    if (context.blocked || !remoteStore || context.queue.length === 0) {
      notify(userId, context.blocked ? 'blocked' : 'synced', context);
      return context.queue.length === 0;
    }
    if (context.flushPromise) return context.flushPromise;

    context.flushPromise = (async () => {
      notify(userId, 'saving', context);
      while (context.queue.length > 0) {
        const operation = context.queue[0];
        try {
          await remoteStore.patch(userId, operation.patches);
          context.baseline = applyPatchMap(context.baseline, operation.patches);
          context.queue.shift();
          persistQueue(userId, context);
        } catch (error) {
          onError({ phase: 'remote-write', error, operationId: operation.id });
          notify(userId, 'offline', context);
          return false;
        }
      }
      notify(userId, 'synced', context);
      return true;
    })().finally(() => {
      context.flushPromise = null;
    });

    return context.flushPromise;
  }

  async function load(userId) {
    if (!userId) throw new Error('UID obrigatório para carregar a base.');
    const context = contextFor(userId);
    context.queue = loadQueue(userId);
    const localData = readLocal(userId);

    if (remoteStore?.watchConnection && !context.connectionUnsubscribe) {
      context.connectionUnsubscribe = remoteStore.watchConnection(connected => {
        if (connected) flushQueue(userId);
        else notify(userId, 'offline', context);
      }, error => onError({ phase: 'connection-listen', error }));
    }

    try {
      const remoteRaw = await remoteStore.load(userId);
      const migration = migrateDatabase(remoteRaw || localData || createDefaultDatabase());
      context.baseline = clone(remoteRaw || {});

      if (!remoteRaw || migration.changed) {
        const migrationPatches = createPatchMap(context.baseline, migration.data);
        const alreadyQueued = context.queue.some(item => item.kind === 'migration');
        if (!alreadyQueued) enqueue(userId, migrationPatches, remoteRaw ? 'migration' : 'seed');
      }

      let effective = migration.data;
      for (const operation of context.queue) effective = applyPatchMap(effective, operation.patches);
      context.lastLocal = normalizeDatabase(effective);
      context.loaded = true;
      writeLocal(userId, context.lastLocal);
      await flushQueue(userId);
      return {
        data: clone(context.lastLocal),
        source: remoteRaw ? 'remote' : 'local-seeded',
        pending: context.queue.length
      };
    } catch (error) {
      if (error instanceof UnsupportedSchemaVersionError) {
        context.blocked = true;
        onError({ phase: 'incompatible-schema', error });
      } else {
        onError({ phase: 'remote-read', error });
      }

      context.baseline = clone(localData || createDefaultDatabase());
      let effective = localData || createDefaultDatabase();
      for (const operation of context.queue) effective = applyPatchMap(effective, operation.patches);
      context.lastLocal = normalizeDatabase(effective);
      context.loaded = true;
      writeLocal(userId, context.lastLocal);
      notify(userId, context.blocked ? 'blocked' : 'offline', context);
      return {
        data: clone(context.lastLocal),
        source: context.blocked ? 'local-readonly' : 'local',
        pending: context.queue.length,
        readOnly: context.blocked
      };
    }
  }

  async function save(data, userId) {
    if (!userId) throw new Error('UID obrigatório para salvar a base.');
    const context = contextFor(userId);
    const normalized = normalizeDatabase(data);
    const previous = context.lastLocal || readLocal(userId) || createDefaultDatabase();
    const patches = createPatchMap(previous, normalized);
    const localSaved = writeLocal(userId, normalized);
    context.lastLocal = clone(normalized);

    if (context.blocked) {
      notify(userId, 'blocked', context);
      return { local: localSaved, remote: false, queued: context.queue.length, blocked: true };
    }

    enqueue(userId, patches);
    const remoteSaved = await flushQueue(userId);
    return { local: localSaved, remote: remoteSaved, queued: context.queue.length };
  }

  function subscribe(userId, onData) {
    subscriptions.get(userId)?.();
    if (!remoteStore?.subscribe) return () => {};

    const unsubscribe = remoteStore.subscribe(userId, raw => {
      const context = contextFor(userId);
      if (context.blocked || !raw) return;
      try {
        const migrated = normalizeDatabase(raw);
        context.baseline = clone(raw);
        let effective = migrated;
        for (const operation of context.queue) effective = applyPatchMap(effective, operation.patches);
        if (JSON.stringify(effective) === JSON.stringify(context.lastLocal)) return;
        context.lastLocal = clone(effective);
        writeLocal(userId, effective);
        onData(clone(effective));
      } catch (error) {
        onError({ phase: 'remote-listen', error });
      }
    }, error => onError({ phase: 'remote-listen', error }));

    subscriptions.set(userId, unsubscribe);
    return unsubscribe;
  }

  async function retry(userId) {
    return flushQueue(userId);
  }

  function createRecoveryPoint(data, userId, reason) {
    const key = getRecoveryStorageKey(userId);
    const entries = readJson(key, [], 'recovery-read');
    const recovery = {
      id: `recovery_${now()}`,
      createdAt: new Date(now()).toISOString(),
      reason,
      data: normalizeDatabase(data)
    };
    const next = [recovery, ...(Array.isArray(entries) ? entries : [])].slice(0, 5);
    return writeJson(key, next, 'recovery-write') ? recovery : null;
  }

  function restoreLatestRecovery(userId) {
    const entries = readJson(getRecoveryStorageKey(userId), [], 'recovery-read');
    if (!Array.isArray(entries) || !entries[0]?.data) return null;
    return normalizeDatabase(entries[0].data);
  }

  function getSyncState(userId) {
    const context = contextFor(userId);
    return { pending: context.queue.length, blocked: context.blocked };
  }

  function destroy() {
    subscriptions.forEach(unsubscribe => unsubscribe?.());
    subscriptions.clear();
    contexts.forEach(context => context.connectionUnsubscribe?.());
  }

  return {
    createRecoveryPoint,
    destroy,
    getSyncState,
    load,
    restoreLatestRecovery,
    retry,
    save,
    subscribe
  };
}
