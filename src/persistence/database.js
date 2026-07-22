export const DATABASE_STORAGE_KEY = 'fluxoturno_db';

export const DEFAULT_DATABASE = Object.freeze({
  settings: {
    morningRate: 35,
    nightRate: 25,
    currency: 'EUR',
    offDays: [4],
    halfDays: { 0: 'morning' },
    autoFillWorkedDays: false,
    autoFillStartedAt: null,
    autoFillLastDate: null,
    language: 'pt-BR',
    theme: 'dark'
  },
  workedDays: {},
  payments: []
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createDefaultDatabase() {
  return clone(DEFAULT_DATABASE);
}

export function normalizeDatabase(value) {
  const database = value && typeof value === 'object' ? clone(value) : createDefaultDatabase();
  const defaultSettings = DEFAULT_DATABASE.settings;

  database.settings = database.settings && typeof database.settings === 'object'
    ? database.settings
    : clone(defaultSettings);

  if (!Array.isArray(database.settings.offDays)) database.settings.offDays = clone(defaultSettings.offDays);
  if (!database.settings.halfDays || typeof database.settings.halfDays !== 'object') database.settings.halfDays = {};
  if (database.settings.autoFillWorkedDays === undefined) database.settings.autoFillWorkedDays = false;
  if (database.settings.autoFillStartedAt === undefined) database.settings.autoFillStartedAt = null;
  if (database.settings.autoFillLastDate === undefined) database.settings.autoFillLastDate = null;
  if (!database.settings.language) database.settings.language = defaultSettings.language;
  if (!database.settings.theme) database.settings.theme = defaultSettings.theme;

  // Compatibilidade com os valores padrão das primeiras versões.
  if (database.settings.morningRate === 80) database.settings.morningRate = 35;
  if (database.settings.nightRate === 100) database.settings.nightRate = 25;

  if (!database.workedDays || typeof database.workedDays !== 'object') database.workedDays = {};
  if (!Array.isArray(database.payments)) database.payments = [];
  database.payments.forEach(payment => {
    if (payment.advanceRemaining === undefined) payment.advanceRemaining = 0;
  });

  return database;
}

export function createDatabaseRepository({
  localStorage,
  remoteStore,
  storageKey = DATABASE_STORAGE_KEY,
  onError = () => {}
}) {
  function loadLocal() {
    try {
      const stored = localStorage?.getItem(storageKey);
      return normalizeDatabase(stored ? JSON.parse(stored) : null);
    } catch (error) {
      onError({ phase: 'local-read', error });
      return createDefaultDatabase();
    }
  }

  async function save(data, userId) {
    const normalized = normalizeDatabase(data);
    const result = { local: false, remote: !userId || !remoteStore };

    try {
      localStorage?.setItem(storageKey, JSON.stringify(normalized));
      result.local = true;
    } catch (error) {
      onError({ phase: 'local-write', error });
    }

    if (userId && remoteStore) {
      try {
        await remoteStore.save(userId, normalized);
        result.remote = true;
      } catch (error) {
        onError({ phase: 'remote-write', error });
      }
    }

    return result;
  }

  async function load(userId) {
    if (userId && remoteStore) {
      try {
        const remoteData = await remoteStore.load(userId);
        if (remoteData) {
          return { data: normalizeDatabase(remoteData), source: 'remote' };
        }

        const localData = loadLocal();
        await save(localData, userId);
        return { data: localData, source: 'local-seeded' };
      } catch (error) {
        onError({ phase: 'remote-read', error });
      }
    }

    return { data: loadLocal(), source: 'local' };
  }

  return { load, save };
}
