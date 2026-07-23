import { describe, expect, it } from 'vitest';
import {
  addMoney,
  fromCents,
  moneyEquals,
  normalizeMoney,
  subtractMoney,
  sumMoney,
  toCents
} from '../../src/domain/money.js';

describe('aritmética monetária centesimal', () => {
  it('elimina resíduos de ponto flutuante', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(normalizeMoney(10.005)).toBe(10.01);
    expect(addMoney(0.1, 0.2)).toBe(0.3);
    expect(subtractMoney(1, 0.9)).toBe(0.1);
    expect(sumMoney([0.1, 0.2, 0.3])).toBe(0.6);
    expect(moneyEquals(0.1 + 0.2, 0.3)).toBe(true);
    expect(fromCents(1)).toBe(0.01);
  });

  it('rejeita valores inválidos ou fora do limite', () => {
    expect(() => toCents(Number.NaN)).toThrow('inválido');
    expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow('inválido');
    expect(() => toCents(20_000_000)).toThrow('limite');
  });
});
