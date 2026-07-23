export const CURRENT_SCHEMA_VERSION = 2;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_WORKED_DAYS = 20_000;
export const MAX_PAYMENTS = 10_000;

export class UnsupportedSchemaVersionError extends Error {
  constructor(version) {
    super(`Versão de schema ${version} não suportada; máximo conhecido: ${CURRENT_SCHEMA_VERSION}.`);
    this.name = 'UnsupportedSchemaVersionError';
    this.version = version;
  }
}

export class InvalidDatabaseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidDatabaseError';
  }
}

export const DEFAULT_DATABASE = Object.freeze({
  schemaVersion: CURRENT_SCHEMA_VERSION,
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

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createDefaultDatabase() {
  return clone(DEFAULT_DATABASE);
}

function ensureDatabaseShape(database) {
  const defaults = DEFAULT_DATABASE.settings;
  database.settings = database.settings && typeof database.settings === 'object' && !Array.isArray(database.settings)
    ? database.settings
    : clone(defaults);

  if (!Array.isArray(database.settings.offDays)) database.settings.offDays = clone(defaults.offDays);
  if (!database.settings.halfDays || typeof database.settings.halfDays !== 'object') database.settings.halfDays = {};
  if (database.settings.autoFillWorkedDays === undefined) database.settings.autoFillWorkedDays = false;
  if (database.settings.autoFillStartedAt === undefined) database.settings.autoFillStartedAt = null;
  if (database.settings.autoFillLastDate === undefined) database.settings.autoFillLastDate = null;
  if (!database.settings.language) database.settings.language = defaults.language;
  if (!database.settings.theme) database.settings.theme = defaults.theme;
  if (!Number.isFinite(database.settings.morningRate)) database.settings.morningRate = defaults.morningRate;
  if (!Number.isFinite(database.settings.nightRate)) database.settings.nightRate = defaults.nightRate;
  if (!database.settings.currency) database.settings.currency = defaults.currency;

  if (!database.workedDays || typeof database.workedDays !== 'object' || Array.isArray(database.workedDays)) {
    database.workedDays = {};
  }
  if (!Array.isArray(database.payments)) database.payments = [];
  database.payments.forEach(payment => {
    if (payment && payment.advanceRemaining === undefined) payment.advanceRemaining = 0;
  });
}

function migrateVersionZero(database) {
  ensureDatabaseShape(database);
  // Compatibilidade restrita à base sem versão das primeiras versões.
  if (database.settings.morningRate === 80) database.settings.morningRate = 35;
  if (database.settings.nightRate === 100) database.settings.nightRate = 25;
  database.schemaVersion = 1;
}

function migrateVersionOne(database) {
  // A versão 2 formaliza o cache por UID e patches; o formato financeiro é preservado.
  database.schemaVersion = 2;
}

export function migrateDatabase(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const database = clone(source);
  const rawVersion = database.schemaVersion ?? 0;
  const fromVersion = Number.isInteger(rawVersion) && rawVersion >= 0 ? rawVersion : 0;

  if (fromVersion > CURRENT_SCHEMA_VERSION) throw new UnsupportedSchemaVersionError(fromVersion);

  let version = fromVersion;
  if (version === 0) {
    migrateVersionZero(database);
    version = 1;
  }
  if (version === 1) {
    migrateVersionOne(database);
    version = 2;
  }
  ensureDatabaseShape(database);

  return {
    data: database,
    fromVersion,
    toVersion: version,
    changed: JSON.stringify(source) !== JSON.stringify(database)
  };
}

export function normalizeDatabase(value) {
  return migrateDatabase(value).data;
}

function assertSafeKeys(value, path = 'raiz') {
  if (!value || typeof value !== 'object') return;
  for (const key of Object.keys(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) {
      throw new InvalidDatabaseError(`Chave insegura em ${path}: ${key}.`);
    }
    if (['.', '#', '$', '[', ']', '/'].some(character => key.includes(character))) {
      throw new InvalidDatabaseError(`Chave incompatível com Firebase em ${path}: ${key}.`);
    }
    assertSafeKeys(value[key], `${path}.${key}`);
  }
}

function assertFiniteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new InvalidDatabaseError(`${label} deve ser um número não negativo.`);
  }
}

function assertFinitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new InvalidDatabaseError(`${label} deve ser um número maior que zero.`);
  }
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function validateImportedDatabase(value, rawText = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidDatabaseError('O arquivo deve conter um objeto JSON na raiz.');
  }
  if (rawText && new TextEncoder().encode(rawText).length > MAX_IMPORT_BYTES) {
    throw new InvalidDatabaseError('O arquivo excede o limite de 5 MB.');
  }
  if (!value.settings || typeof value.settings !== 'object' || Array.isArray(value.settings)) {
    throw new InvalidDatabaseError('Configurações ausentes ou inválidas.');
  }
  if (!value.workedDays || typeof value.workedDays !== 'object' || Array.isArray(value.workedDays)) {
    throw new InvalidDatabaseError('Lista de dias trabalhados ausente ou inválida.');
  }
  if (!Array.isArray(value.payments)) {
    throw new InvalidDatabaseError('Lista de pagamentos ausente ou inválida.');
  }

  assertSafeKeys(value);
  assertFiniteNonNegative(value.settings.morningRate, 'Tarifa da manhã');
  assertFiniteNonNegative(value.settings.nightRate, 'Tarifa da noite');
  const workedEntries = Object.entries(value.workedDays);
  if (workedEntries.length > MAX_WORKED_DAYS) throw new InvalidDatabaseError('Quantidade de dias acima do limite seguro.');
  if (value.payments.length > MAX_PAYMENTS) throw new InvalidDatabaseError('Quantidade de pagamentos acima do limite seguro.');

  for (const [date, day] of workedEntries) {
    if (!isValidIsoDate(date) || !day || typeof day !== 'object' || Array.isArray(day)) {
      throw new InvalidDatabaseError(`Registro de dia inválido: ${date}.`);
    }
    assertFiniteNonNegative(day.rate ?? 0, `Tarifa de ${date}`);
    assertFiniteNonNegative(day.amountPaid ?? 0, `Valor pago de ${date}`);
    assertFiniteNonNegative(day.pendingAmount ?? 0, `Valor pendente de ${date}`);
  }

  for (const payment of value.payments) {
    if (!payment || typeof payment !== 'object' || typeof payment.id !== 'string' || !payment.id) {
      throw new InvalidDatabaseError('Pagamento sem identificador válido.');
    }
    assertFinitePositive(payment.amount, `Valor do pagamento ${payment.id}`);
  }

  return normalizeDatabase(value);
}
