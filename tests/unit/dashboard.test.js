import { describe, expect, it } from 'vitest';
import {
  calculateCashReceivedInMonth,
  calculateEarnedInMonth,
  calculateFinancialSummary,
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

  it('separa caixa por data do pagamento e competência por data trabalhada', () => {
    const state = {
      workedDays: {
        '2026-06-30': { period: 'morning', rate: 100, amountPaid: 100, pendingAmount: 0 },
        '2026-07-01': { period: 'morning', rate: 35, amountPaid: 35, pendingAmount: 0 },
        '2026-07-02': { period: 'vacation', rate: 999, amountPaid: 0, pendingAmount: 0 }
      },
      payments: [
        { date: '2026-07-05', amount: 100, advanceRemaining: 65 },
        { date: '2026-08-01', amount: 35, advanceRemaining: 0 }
      ]
    };

    expect(calculateCashReceivedInMonth(state.payments, new Date(2026, 6, 15))).toBe(100);
    expect(calculateEarnedInMonth(state.workedDays, new Date(2026, 6, 15))).toBe(35);
    expect(calculateFinancialSummary(state, new Date(2026, 6, 15))).toMatchObject({
      totalEarnings: 135,
      totalAdvance: 65,
      netBalance: -65,
      receivedThisMonthCash: 100,
      earnedThisMonth: 35
    });
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
