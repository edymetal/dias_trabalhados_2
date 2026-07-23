import { describe, expect, it } from 'vitest';
import {
  allocatePaymentAcrossDays,
  applyAdvanceCreditsToDay,
  isFinancialDay,
  reconcileLedger,
  refundPaymentCreditsFromDay,
  reversePayment,
  validateLedgerInvariants
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
    expect(day).toMatchObject({ amountPaid: 0, pendingAmount: 0, status: 'not-applicable' });
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

  it('mantém dias de semanas não selecionadas sem pagamento', () => {
    const selectedDay = workedDay('2026-05-18', 80);
    const unselectedDay = workedDay('2026-05-25', 100);

    const allocation = allocatePaymentAcrossDays({
      amount: 120,
      paymentId: 'pay_selected_week',
      primaryDays: [selectedDay]
    });

    expect(selectedDay).toMatchObject({ amountPaid: 80, pendingAmount: 0, status: 'paid' });
    expect(unselectedDay).toMatchObject({ amountPaid: 0, pendingAmount: 100, status: 'unpaid' });
    expect(allocation).toEqual({ advanceRemaining: 40, coveredDays: ['2026-05-18'] });
  });

  it('calcula centavos exatamente e ignora dias secundários por padrão', () => {
    const selected = workedDay('2026-05-18', 0.3);
    const other = workedDay('2026-05-25', 1);
    const allocation = allocatePaymentAcrossDays({
      amount: 0.1 + 0.2,
      paymentId: 'pay_cents',
      primaryDays: [selected],
      secondaryDays: [other]
    });

    expect(selected).toMatchObject({ amountPaid: 0.3, pendingAmount: 0, status: 'paid' });
    expect(other.amountPaid).toBe(0);
    expect(allocation).toEqual({ advanceRemaining: 0, coveredDays: ['2026-05-18'] });
  });

  it('trata férias como marcador não financeiro', () => {
    const vacation = workedDay('2026-08-01', 35);
    vacation.period = 'vacation';

    const allocation = allocatePaymentAcrossDays({
      amount: 35,
      paymentId: 'pay_vacation',
      primaryDays: [vacation]
    });

    expect(isFinancialDay(vacation)).toBe(false);
    expect(vacation).toMatchObject({
      rate: 0, amountPaid: 0, pendingAmount: 0, status: 'not-applicable'
    });
    expect(allocation.advanceRemaining).toBe(35);
  });

  it('valida o fechamento entre pagamento, aplicações e crédito', () => {
    const day = workedDay('2026-05-18', 80);
    const allocation = allocatePaymentAcrossDays({
      amount: 100,
      paymentId: 'pay_balanced',
      primaryDays: [day]
    });
    const state = {
      workedDays: { [day.date]: day },
      payments: [{
        id: 'pay_balanced',
        date: '2026-05-18',
        amount: 100,
        coveredDays: allocation.coveredDays,
        advanceRemaining: allocation.advanceRemaining
      }]
    };

    expect(validateLedgerInvariants(state)).toEqual([]);
    state.payments[0].advanceRemaining = 10;
    expect(validateLedgerInvariants(state)).toContain(
      'Pagamento pay_balanced não fecha aplicações + crédito.'
    );
  });

  it('reconcilia referências órfãs, excesso e dias cobertos', () => {
    const day = workedDay('2026-05-18', 80);
    day.amountPaid = 100;
    day.pendingAmount = 99;
    day.paymentsApplied = { pay_valid: 100, pay_missing: 5 };
    const state = {
      workedDays: { [day.date]: day },
      payments: [{
        id: 'pay_valid',
        date: '2026-05-20',
        amount: 100,
        advanceRemaining: 999,
        coveredDays: ['data-incorreta']
      }]
    };

    const result = reconcileLedger(state);

    expect(result.repairs.length).toBeGreaterThan(0);
    expect(day).toMatchObject({
      amountPaid: 80,
      pendingAmount: 0,
      paymentsApplied: { pay_valid: 80 }
    });
    expect(state.payments[0]).toMatchObject({
      advanceRemaining: 20,
      coveredDays: ['2026-05-18']
    });
    expect(validateLedgerInvariants(state)).toEqual([]);
  });

  it('bloqueia redução que apagaria pagamento legado não rastreável', () => {
    const day = workedDay('2026-05-18', 80);
    day.amountPaid = 40;
    day.pendingAmount = 40;
    day.unlinkedAmountPaid = 40;
    const before = structuredClone(day);

    expect(refundPaymentCreditsFromDay({ payments: [] }, day, 20)).toBe(false);
    expect(day).toEqual(before);
  });
});
