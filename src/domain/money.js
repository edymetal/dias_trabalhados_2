export const CENTS_PER_UNIT = 100;
export const MAX_MONEY_CENTS = 10_000_000_00;

export function toCents(value) {
  const numeric = typeof value === 'string' ? Number.parseFloat(value.replace(',', '.')) : Number(value);
  if (!Number.isFinite(numeric)) throw new TypeError('Valor monetário inválido.');

  const cents = Math.round((numeric + Math.sign(numeric) * Number.EPSILON) * CENTS_PER_UNIT);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_MONEY_CENTS) {
    throw new RangeError('Valor monetário fora do limite seguro.');
  }
  return cents;
}

export function fromCents(cents) {
  if (!Number.isSafeInteger(cents)) throw new TypeError('Centavos devem ser um número inteiro seguro.');
  return cents / CENTS_PER_UNIT;
}

export function normalizeMoney(value) {
  return fromCents(toCents(value));
}

export function addMoney(...values) {
  return fromCents(values.reduce((total, value) => total + toCents(value), 0));
}

export function subtractMoney(value, subtract) {
  return fromCents(toCents(value) - toCents(subtract));
}

export function sumMoney(values) {
  return fromCents([...values].reduce((total, value) => total + toCents(value || 0), 0));
}

export function minMoney(...values) {
  return fromCents(Math.min(...values.map(toCents)));
}

export function moneyEquals(left, right) {
  return toCents(left) === toCents(right);
}

export function isNonNegativeMoney(value) {
  try {
    return toCents(value) >= 0;
  } catch {
    return false;
  }
}
