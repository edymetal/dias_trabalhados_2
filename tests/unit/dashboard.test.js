import { describe, expect, it } from 'vitest';
import {
  calculateAccumulatedInMonth,
  calculateCashReceivedInMonth,
  calculateEarnedInMonth,
  calculateExpectedPaymentDate,
  calculateFinancialSummary,
  calculatePaymentDelaySummary,
  calculateReceivedByMonthInYear,
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
      '2026-06-30': { period: 'morning', rate: 100, amountPaid: 100, pendingAmount: 0 },
      '2026-07-01': { period: 'morning', rate: 35, amountPaid: 35, pendingAmount: 0 },
      '2026-07-31': { period: 'night', rate: 50, amountPaid: 25, pendingAmount: 25 },
      '2026-08-01': { period: 'morning', rate: 200, amountPaid: 200, pendingAmount: 0 }
    };

    expect(calculateReceivedForWorkedDaysInMonth(workedDays, new Date(2026, 6, 15))).toBe(60);
    expect(calculateAccumulatedInMonth(workedDays, new Date(2026, 6, 15))).toBe(85);
  });

  it('apresenta os doze meses do ano com o total recebido em cada mês', () => {
    const workedDays = {
      '2025-12-31': { period: 'morning', rate: 90, amountPaid: 90 },
      '2026-01-02': { period: 'morning', rate: 35, amountPaid: 35 },
      '2026-01-03': { period: 'night', rate: 25, amountPaid: 10 },
      '2026-07-10': { period: 'both', rate: 60, amountPaid: 60 },
      '2026-08-01': { period: 'vacation', rate: 999, amountPaid: 999 },
      '2027-01-01': { period: 'morning', rate: 100, amountPaid: 100 }
    };

    expect(calculateReceivedByMonthInYear(workedDays, 2026)).toEqual([
      45, 0, 0, 0, 0, 0, 60, 0, 0, 0, 0, 0
    ]);
  });

  it('calcula a data prevista conforme o ciclo semanal ou mensal', () => {
    expect(calculateExpectedPaymentDate('2026-07-06', { type: 'weekly', day: 5 })).toBe('2026-07-10');
    expect(calculateExpectedPaymentDate('2026-07-11', { type: 'weekly', day: 5 })).toBe('2026-07-17');
    expect(calculateExpectedPaymentDate('2026-07-04', { type: 'monthly', day: 5 })).toBe('2026-07-05');
    expect(calculateExpectedPaymentDate('2026-07-06', { type: 'monthly', day: 5 })).toBe('2026-08-05');
  });

  it('agrupa atrasos pelo mês da data prevista e destaca o maior valor afetado', () => {
    const state = {
      settings: { paymentCycle: { type: 'weekly', day: 0 } },
      workedDays: {
        '2026-01-05': {
          period: 'morning', rate: 100, paymentsApplied: { pay_jan: 100 }
        },
        '2026-01-06': {
          period: 'night', rate: 50, paymentsApplied: { pay_jan: 50 }
        },
        '2026-01-12': {
          period: 'morning', rate: 90, paymentsApplied: { pay_on_time: 90 }
        },
        '2026-02-02': {
          period: 'morning', rate: 200, paymentsApplied: { pay_feb_a: 200 }
        },
        '2026-02-03': {
          period: 'night', rate: 50, paymentsApplied: { pay_feb_b: 50 }
        },
        '2025-12-22': {
          period: 'morning', rate: 500, paymentsApplied: { pay_previous_year: 500 }
        },
        '2026-03-02': {
          period: 'morning', rate: 70, amountPaid: 70
        }
      },
      payments: [
        { id: 'pay_jan', date: '2026-01-13', amount: 150 },
        { id: 'pay_on_time', date: '2026-01-18', amount: 90 },
        { id: 'pay_feb_a', date: '2026-02-15', amount: 200 },
        { id: 'pay_feb_b', date: '2026-02-10', amount: 50 },
        { id: 'pay_previous_year', date: '2026-01-10', amount: 500 }
      ]
    };

    const summary = calculatePaymentDelaySummary(state, 2026);

    expect(summary).toMatchObject({
      year: 2026,
      delayCount: 2,
      expectedAmount: 400
    });
    expect(summary.months[0]).toMatchObject({
      delayCount: 1,
      expectedAmount: 150,
      averageDaysLate: 2,
      maxDaysLate: 2
    });
    expect(summary.months[0].events[0]).toMatchObject({
      dueDate: '2026-01-11',
      paymentDate: '2026-01-13',
      amount: 150,
      daysLate: 2,
      coveredDays: 2
    });
    expect(summary.months[1]).toMatchObject({
      delayCount: 1,
      expectedAmount: 250,
      averageDaysLate: 7,
      maxDaysLate: 7
    });
    expect(summary.months[1].events[0]).toMatchObject({
      dueDate: '2026-02-08',
      paymentDate: '2026-02-15',
      amount: 250,
      daysLate: 7,
      paymentCount: 2,
      paymentDates: [
        { date: '2026-02-10', amount: 50, daysLate: 2 },
        { date: '2026-02-15', amount: 200, daysLate: 7 }
      ]
    });
    expect(summary.mostProblematicMonth.monthIndex).toBe(1);
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
      receivedThisMonth: 35,
      accumulatedThisMonth: 35,
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
