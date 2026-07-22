import { describe, expect, it } from 'vitest';
import {
  allocatePaymentAcrossDays,
  applyAdvanceCreditsToDay,
  refundPaymentCreditsFromDay,
  reversePayment
} from '../../src/domain/ledger.js';

function workedDay(date, rate) {
  return {
    date,
    period: 'morning',
    rate,
    status: 'unpaid',
    amountPaid: 0,
    pendingAmount: rate,
    paymentsApplied: {}
  };
}

describe('livro financeiro', () => {
  it('distribui pagamento parcial em FIFO pela ordem recebida', () => {
    const days = [
      workedDay('2026-05-18', 80),
      workedDay('2026-05-19', 100),
      workedDay('2026-05-20', 180)
    ];

    const allocation = allocatePaymentAcrossDays({
      amount: 200,
      paymentId: 'pay_fifo',
      primaryDays: days
    });

    expect(days[0]).toMatchObject({ amountPaid: 80, pendingAmount: 0, status: 'paid' });
    expect(days[1]).toMatchObject({ amountPaid: 100, pendingAmount: 0, status: 'paid' });
    expect(days[2]).toMatchObject({ amountPaid: 20, pendingAmount: 160, status: 'partial' });
    expect(allocation).toEqual({
      advanceRemaining: 0,
      coveredDays: ['2026-05-18', '2026-05-19', '2026-05-20']
    });
  });

  it('mantém excedente como crédito antecipado', () => {
    const day = workedDay('2026-05-18', 80);

    expect(allocatePaymentAcrossDays({
      amount: 100,
      paymentId: 'pay_advance',
      primaryDays: [day]
    })).toEqual({
      advanceRemaining: 20,
      coveredDays: ['2026-05-18']
    });
  });

  it('consome e devolve crédito antecipado', () => {
    const state = {
      workedDays: {},
      payments: [{
        id: 'pay_advance',
        date: '2026-05-18',
        amount: 100,
        advanceRemaining: 40,
        coveredDays: []
      }]
    };
    const day = workedDay('2026-05-22', 80);

    applyAdvanceCreditsToDay(state, day);
    expect(day).toMatchObject({ amountPaid: 40, pendingAmount: 40, status: 'partial' });
    expect(state.payments[0].advanceRemaining).toBe(0);

    refundPaymentCreditsFromDay(state, day, 0);
    expect(day).toMatchObject({ amountPaid: 0, pendingAmount: 0, status: 'paid' });
    expect(day.paymentsApplied).toEqual({});
    expect(state.payments[0]).toMatchObject({ advanceRemaining: 40, coveredDays: [] });
  });

  it('estorna somente as aplicações do pagamento escolhido', () => {
    const day = workedDay('2026-05-18', 80);
    allocatePaymentAcrossDays({ amount: 30, paymentId: 'pay_a', primaryDays: [day] });
    allocatePaymentAcrossDays({ amount: 20, paymentId: 'pay_b', primaryDays: [day] });

    const state = {
      workedDays: { [day.date]: day },
      payments: [
        { id: 'pay_a', amount: 30, coveredDays: [day.date], advanceRemaining: 0 },
        { id: 'pay_b', amount: 20, coveredDays: [day.date], advanceRemaining: 0 }
      ]
    };

    expect(reversePayment(state, 'pay_a')).toBe(true);
    expect(day).toMatchObject({ amountPaid: 20, pendingAmount: 60, status: 'partial' });
    expect(day.paymentsApplied).toEqual({ pay_b: 20 });
    expect(state.payments.map(payment => payment.id)).toEqual(['pay_b']);
  });

  it.todo('restringe o excedente às semanas selecionadas antes de criar crédito');
});
