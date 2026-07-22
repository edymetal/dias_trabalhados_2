import { describe, expect, it } from 'vitest';
import {
  calculateReceivedForWorkedDaysInMonth,
  getMonthDateRange,
  splitPaymentMethod
} from '../../src/domain/dashboard.js';

describe('resumo do dashboard', () => {
  it('calcula os limites do mês no calendário local', () => {
    expect(getMonthDateRange(new Date(2026, 1, 10))).toEqual({
      startStr: '2026-02-01',
      endStr: '2026-02-28'
    });
  });

  it('soma somente pagamentos aplicados aos dias do mês', () => {
    const workedDays = {
      '2026-06-30': { amountPaid: 100 },
      '2026-07-01': { amountPaid: 35 },
      '2026-07-31': { amountPaid: 25 },
      '2026-08-01': { amountPaid: 200 }
    };

    expect(calculateReceivedForWorkedDaysInMonth(workedDays, new Date(2026, 6, 15))).toBe(60);
  });

  it('separa métodos explícitos e preserva a leitura de pagamentos legados', () => {
    expect(splitPaymentMethod({ amount: 100, cashAmount: 30, depositAmount: 70 })).toEqual({
      cashRatio: 0.3,
      depositRatio: 0.7
    });
    expect(splitPaymentMethod({ amount: 100, method: 'Dinheiro' })).toEqual({
      cashRatio: 1,
      depositRatio: 0
    });
    expect(splitPaymentMethod({ amount: 100, method: 'Transferência' })).toEqual({
      cashRatio: 0,
      depositRatio: 1
    });
  });
});
