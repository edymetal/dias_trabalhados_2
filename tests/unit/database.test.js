import { describe, expect, it, vi } from 'vitest';
import {
  createDatabaseRepository,
  createDefaultDatabase,
  DATABASE_STORAGE_KEY,
  getQueueStorageKey,
  getUserStorageKey,
  LEGACY_OWNER_KEY
} from '../../src/persistence/database.js';
import { applyPatchMap } from '../../src/persistence/patches.js';
import { clone } from '../../src/persistence/schema.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, value)),
    removeItem: vi.fn(key => values.delete(key)),
    values
  };
}

function memoryRemote(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, clone(value)]));
  const listeners = new Map();
  let online = true;
  const api = {
    load: vi.fn(async userId => {
      if (!online) throw new Error('offline');
      return values.has(userId) ? clone(values.get(userId)) : null;
    }),
    patch: vi.fn(async (userId, patches) => {
      if (!online) throw new Error('offline');
      const next = applyPatchMap(values.get(userId) || {}, patches);
      values.set(userId, next);
      listeners.get(userId)?.forEach(listener => listener(clone(next)));
    }),
    subscribe(userId, onData) {
      if (!listeners.has(userId)) listeners.set(userId, new Set());
      listeners.get(userId).add(onData);
      return () => listeners.get(userId)?.delete(onData);
    },
    setOnline(value) {
      online = value;
    },
    value(userId) {
      return clone(values.get(userId));
    }
  };
  return api;
}

function workedDay(date, rate = 35) {
  return { date, period: 'morning', rate, amountPaid: 0, pendingAmount: rate, status: 'unpaid' };
}

describe('repositório persistente por usuário', () => {
  it('isola caches por UID e reivindica o cache legado uma única vez', async () => {
    const legacy = createDefaultDatabase();
    legacy.workedDays['2026-07-23'] = workedDay('2026-07-23');
    const storage = memoryStorage({ [DATABASE_STORAGE_KEY]: JSON.stringify(legacy) });
    const remote = memoryRemote();

    const alice = createDatabaseRepository({ localStorage: storage, remoteStore: remote });
    const aliceData = await alice.load('alice');
    const bob = createDatabaseRepository({ localStorage: storage, remoteStore: remote });
    const bobData = await bob.load('bob');

    expect(aliceData.data.workedDays).toHaveProperty('2026-07-23');
    expect(bobData.data.workedDays).toEqual({});
    expect(storage.getItem(LEGACY_OWNER_KEY)).toBe('alice');
    expect(storage.getItem(getUserStorageKey('alice'))).toBeTruthy();
    expect(storage.getItem(getUserStorageKey('bob'))).toBeTruthy();
  });

  it('persiste uma fila offline e a envia após reiniciar', async () => {
    const storage = memoryStorage();
    const remote = memoryRemote({ alice: createDefaultDatabase() });
    const first = createDatabaseRepository({ localStorage: storage, remoteStore: remote });
    const loaded = await first.load('alice');

    remote.setOnline(false);
    loaded.data.workedDays['2026-07-23'] = workedDay('2026-07-23');
    const offlineResult = await first.save(loaded.data, 'alice');
    expect(offlineResult).toMatchObject({ local: true, remote: false, queued: 1 });
    expect(JSON.parse(storage.getItem(getQueueStorageKey('alice')))).toHaveLength(1);

    remote.setOnline(true);
    const restarted = createDatabaseRepository({ localStorage: storage, remoteStore: remote });
    const recovered = await restarted.load('alice');

    expect(recovered.data.workedDays).toHaveProperty('2026-07-23');
    expect(remote.value('alice').workedDays).toHaveProperty('2026-07-23');
    expect(JSON.parse(storage.getItem(getQueueStorageKey('alice')))).toHaveLength(0);
  });

  it('preserva alterações concorrentes feitas em caminhos diferentes', async () => {
    const remote = memoryRemote({ alice: createDefaultDatabase() });
    const first = createDatabaseRepository({ localStorage: memoryStorage(), remoteStore: remote });
    const second = createDatabaseRepository({ localStorage: memoryStorage(), remoteStore: remote });
    const firstData = (await first.load('alice')).data;
    const secondData = (await second.load('alice')).data;

    firstData.workedDays['2026-07-22'] = workedDay('2026-07-22');
    secondData.workedDays['2026-07-23'] = workedDay('2026-07-23', 25);
    await Promise.all([first.save(firstData, 'alice'), second.save(secondData, 'alice')]);

    expect(remote.value('alice').workedDays).toMatchObject({
      '2026-07-22': { rate: 35 },
      '2026-07-23': { rate: 25 }
    });
    expect(remote.patch).toHaveBeenCalledTimes(2);
  });

  it('propaga atualizações remotas para uma sessão inscrita', async () => {
    const remote = memoryRemote({ alice: createDefaultDatabase() });
    const first = createDatabaseRepository({ localStorage: memoryStorage(), remoteStore: remote });
    const second = createDatabaseRepository({ localStorage: memoryStorage(), remoteStore: remote });
    await first.load('alice');
    const secondData = (await second.load('alice')).data;
    const received = vi.fn();
    first.subscribe('alice', received);

    secondData.settings.theme = 'light';
    await second.save(secondData, 'alice');

    expect(received).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({ theme: 'light' })
    }));
  });

  it('cria e restaura pontos locais de recuperação', async () => {
    const storage = memoryStorage();
    const repository = createDatabaseRepository({ localStorage: storage, remoteStore: memoryRemote() });
    const data = createDefaultDatabase();
    data.workedDays['2026-07-23'] = workedDay('2026-07-23');

    const recovery = repository.createRecoveryPoint(data, 'alice', 'before-clear');
    const restored = repository.restoreLatestRecovery('alice');

    expect(recovery.reason).toBe('before-clear');
    expect(restored.workedDays).toHaveProperty('2026-07-23');
  });

  it('bloqueia sincronização quando a nuvem possui schema futuro', async () => {
    const onError = vi.fn();
    const remote = memoryRemote({ alice: { ...createDefaultDatabase(), schemaVersion: 99 } });
    const repository = createDatabaseRepository({
      localStorage: memoryStorage(), remoteStore: remote, onError
    });

    const loaded = await repository.load('alice');
    loaded.data.settings.theme = 'light';
    const saved = await repository.save(loaded.data, 'alice');

    expect(loaded.readOnly).toBe(true);
    expect(saved.blocked).toBe(true);
    expect(remote.patch).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ phase: 'incompatible-schema' }));
  });
});
