import { addMoney, fromCents, normalizeMoney, sumMoney, toCents } from '../domain/money.js';

export const CURRENT_SCHEMA_VERSION = 3;
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
    autoFillPageSize: 31,
    reportingBasis: 'cash',
    vacationFinancial: false,
    paymentCycle: { type: 'weekly', day: 0 },
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
  database.settings.offDays = [...new Set(database.settings.offDays)]
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((left, right) => left - right);
  if (!database.settings.halfDays || typeof database.settings.halfDays !== 'object') database.settings.halfDays = {};
  database.settings.halfDays = Object.fromEntries(
    Object.entries(database.settings.halfDays)
      .filter(([day, period]) => /^[0-6]$/.test(day) && ['morning', 'night'].includes(period))
  );
  if (database.settings.autoFillWorkedDays === undefined) database.settings.autoFillWorkedDays = false;
  if (database.settings.autoFillStartedAt === undefined) database.settings.autoFillStartedAt = null;
  if (database.settings.autoFillLastDate === undefined) database.settings.autoFillLastDate = null;
  if (!Number.isInteger(database.settings.autoFillPageSize)) database.settings.autoFillPageSize = 31;
  if (!['cash', 'competence'].includes(database.settings.reportingBasis)) {
    database.settings.reportingBasis = 'cash';
  }
  database.settings.vacationFinancial = false;
  if (!database.settings.language) database.settings.language = defaults.language;
  if (!database.settings.theme) database.settings.theme = defaults.theme;
  if (!Number.isFinite(database.settings.morningRate)) database.settings.morningRate = defaults.morningRate;
  if (!Number.isFinite(database.settings.nightRate)) database.settings.nightRate = defaults.nightRate;
  if (!database.settings.currency) database.settings.currency = defaults.currency;
  const cycle = database.settings.paymentCycle;
  if (!cycle || !['weekly', 'monthly'].includes(cycle.type)) {
    database.settings.paymentCycle = { type: 'weekly', day: 0 };
  } else {
    const minimum = cycle.type === 'weekly' ? 0 : 1;
    const maximum = cycle.type === 'weekly' ? 6 : 31;
    database.settings.paymentCycle = {
      type: cycle.type,
      day: Math.max(minimum, Math.min(maximum, Number.parseInt(cycle.day, 10) || minimum))
    };
  }

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

function normalizeFinancialValues(database) {
  database.settings.morningRate = normalizeMoney(database.settings.morningRate);
  database.settings.nightRate = normalizeMoney(database.settings.nightRate);

  for (const day of Object.values(database.workedDays)) {
    day.rate = normalizeMoney(day.rate || 0);
    if (!['morning', 'night', 'both', 'none', 'off', 'vacation'].includes(day.period)) {
      if (day.rate === database.settings.nightRate) day.period = 'night';
      else if (day.rate === addMoney(database.settings.morningRate, database.settings.nightRate)) day.period = 'both';
      else day.period = 'morning';
    }
    day.amountPaid = normalizeMoney(day.amountPaid || 0);
    const isFinancial = !['none', 'off', 'vacation'].includes(day.period) && day.rate > 0;
    day.pendingAmount = isFinancial
      ? normalizeMoney(Math.max(0, day.rate - day.amountPaid))
      : 0;
    day.status = isFinancial
      ? (day.pendingAmount === 0 ? 'paid' : (day.amountPaid > 0 ? 'partial' : 'unpaid'))
      : 'not-applicable';
    day.paymentsApplied = day.paymentsApplied && typeof day.paymentsApplied === 'object'
      ? day.paymentsApplied
      : {};
    for (const paymentId of Object.keys(day.paymentsApplied)) {
      day.paymentsApplied[paymentId] = normalizeMoney(day.paymentsApplied[paymentId] || 0);
    }
    const mappedAmount = sumMoney(Object.values(day.paymentsApplied));
    const unlinkedAmount = Math.max(0, normalizeMoney(day.amountPaid - mappedAmount));
    if (unlinkedAmount > 0) day.unlinkedAmountPaid = unlinkedAmount;
    else delete day.unlinkedAmountPaid;
  }

  for (const payment of database.payments) {
    payment.amount = normalizeMoney(payment.amount || 0);
    const amountCents = toCents(payment.amount);
    const hasCashAmount = Number.isFinite(payment.cashAmount);
    const hasDepositAmount = Number.isFinite(payment.depositAmount);
    let cashCents = hasCashAmount ? Math.max(0, Math.min(amountCents, toCents(payment.cashAmount))) : 0;
    let depositCents = hasDepositAmount
      ? Math.max(0, Math.min(amountCents, toCents(payment.depositAmount)))
      : 0;

    if (hasCashAmount && !hasDepositAmount) {
      depositCents = amountCents - cashCents;
    } else if (!hasCashAmount && hasDepositAmount) {
      cashCents = amountCents - depositCents;
    } else if (cashCents + depositCents !== amountCents) {
      if (['Dinheiro', 'Contanti'].includes(payment.method)) {
        cashCents = amountCents;
        depositCents = 0;
      } else if (payment.method === 'Misto' && cashCents + depositCents === 0) {
        cashCents = Math.floor(amountCents / 2);
        depositCents = amountCents - cashCents;
      } else if (hasCashAmount) {
        depositCents = amountCents - cashCents;
      } else {
        cashCents = 0;
        depositCents = amountCents;
      }
    }
    payment.cashAmount = fromCents(cashCents);
    payment.depositAmount = fromCents(depositCents);
    payment.advanceRemaining = normalizeMoney(payment.advanceRemaining || 0);
    payment.coveredDays = [...new Set(Array.isArray(payment.coveredDays) ? payment.coveredDays : [])].sort();
  }
}

function migrateVersionTwo(database) {
  // A versão 3 torna a aritmética centesimal e explicita caixa, férias e paginação.
  ensureDatabaseShape(database);
  normalizeFinancialValues(database);
  database.schemaVersion = 3;
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
  if (version === 2) {
    migrateVersionTwo(database);
    version = 3;
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
  if (value.settings.offDays !== undefined && (
    !Array.isArray(value.settings.offDays)
    || value.settings.offDays.some(day => !Number.isInteger(day) || day < 0 || day > 6)
  )) {
    throw new InvalidDatabaseError('Dias de folga inválidos.');
  }
  if (value.settings.halfDays !== undefined && (
    !value.settings.halfDays
    || typeof value.settings.halfDays !== 'object'
    || Array.isArray(value.settings.halfDays)
    || Object.entries(value.settings.halfDays)
      .some(([day, period]) => !/^[0-6]$/.test(day) || !['morning', 'night'].includes(period))
  )) {
    throw new InvalidDatabaseError('Configuração de meio período inválida.');
  }
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
    if (day.period !== undefined && !['morning', 'night', 'both', 'none', 'off', 'vacation'].includes(day.period)) {
      throw new InvalidDatabaseError(`Período inválido em ${date}.`);
    }
    if (day.date !== undefined && day.date !== date) {
      throw new InvalidDatabaseError(`Data interna divergente em ${date}.`);
    }
    if (day.paymentsApplied !== undefined && (
      !day.paymentsApplied
      || typeof day.paymentsApplied !== 'object'
      || Array.isArray(day.paymentsApplied)
      || Object.values(day.paymentsApplied).some(amount => !Number.isFinite(amount) || amount < 0)
    )) {
      throw new InvalidDatabaseError(`Aplicações de pagamento inválidas em ${date}.`);
    }
  }

  for (const payment of value.payments) {
    if (!payment || typeof payment !== 'object' || typeof payment.id !== 'string' || !payment.id) {
      throw new InvalidDatabaseError('Pagamento sem identificador válido.');
    }
    assertFinitePositive(payment.amount, `Valor do pagamento ${payment.id}`);
    if ((value.schemaVersion ?? 0) >= 3) {
      assertFiniteNonNegative(payment.cashAmount, `Valor em dinheiro do pagamento ${payment.id}`);
      assertFiniteNonNegative(payment.depositAmount, `Valor em depósito do pagamento ${payment.id}`);
      assertFiniteNonNegative(payment.advanceRemaining, `Crédito do pagamento ${payment.id}`);
      if (
        toCents(payment.cashAmount) + toCents(payment.depositAmount)
        !== toCents(payment.amount)
      ) {
        throw new InvalidDatabaseError(`Divisão financeira inválida no pagamento ${payment.id}.`);
      }
    }
    if (!isValidIsoDate(payment.date)) {
      throw new InvalidDatabaseError(`Data inválida no pagamento ${payment.id}.`);
    }
    if (payment.coveredDays !== undefined && (
      !Array.isArray(payment.coveredDays)
      || payment.coveredDays.some(date => !isValidIsoDate(date))
    )) {
      throw new InvalidDatabaseError(`Dias cobertos inválidos no pagamento ${payment.id}.`);
    }
  }

  return normalizeDatabase(value);
}
