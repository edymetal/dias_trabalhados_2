import { fromCents, normalizeMoney, toCents } from './money.js';

export const NON_FINANCIAL_PERIODS = new Set(['none', 'off', 'vacation']);

export function isFinancialDay(day) {
  return !!day && !NON_FINANCIAL_PERIODS.has(day.period) && toCents(day.rate || 0) > 0;
}

export function refreshDayFinancials(day) {
  if (!isFinancialDay(day)) {
    day.rate = 0;
    day.amountPaid = 0;
    day.pendingAmount = 0;
    day.status = 'not-applicable';
    return day;
  }

  const rateCents = toCents(day.rate || 0);
  const paidCents = Math.max(0, Math.min(rateCents, toCents(day.amountPaid || 0)));
  day.rate = fromCents(rateCents);
  day.amountPaid = fromCents(paidCents);
  day.pendingAmount = fromCents(rateCents - paidCents);
  day.status = paidCents === rateCents ? 'paid' : (paidCents > 0 ? 'partial' : 'unpaid');
  return day;
}

function sortedPaymentsWithCredit(payments) {
  return payments
    .filter(payment => toCents(payment.advanceRemaining || 0) > 0)
    .sort((left, right) => (
      String(left.date || '').localeCompare(String(right.date || ''))
      || String(left.id).localeCompare(String(right.id))
    ));
}

export function applyAdvanceCreditsToDay(state, day) {
  refreshDayFinancials(day);
  if (!isFinancialDay(day) || toCents(day.pendingAmount) === 0) return day;

  for (const payment of sortedPaymentsWithCredit(state.payments || [])) {
    const pendingCents = toCents(day.pendingAmount);
    if (pendingCents === 0) break;

    const creditCents = toCents(payment.advanceRemaining || 0);
    const appliedCents = Math.min(creditCents, pendingCents);
    if (appliedCents <= 0) continue;

    day.amountPaid = fromCents(toCents(day.amountPaid || 0) + appliedCents);
    day.paymentsApplied ||= {};
    day.paymentsApplied[payment.id] = fromCents(
      toCents(day.paymentsApplied[payment.id] || 0) + appliedCents
    );

    payment.coveredDays ||= [];
    if (!payment.coveredDays.includes(day.date)) payment.coveredDays.push(day.date);
    payment.coveredDays.sort();
    payment.advanceRemaining = fromCents(creditCents - appliedCents);
    refreshDayFinancials(day);
  }

  return day;
}

export function refundPaymentCreditsFromDay(state, day, newRate) {
  const targetRateCents = Math.max(0, toCents(newRate || 0));
  let refundNeededCents = Math.max(0, toCents(day.amountPaid || 0) - targetRateCents);
  if (refundNeededCents === 0) {
    day.rate = fromCents(targetRateCents);
    refreshDayFinancials(day);
    return true;
  }

  const payments = new Map((state.payments || []).map(payment => [payment.id, payment]));
  const applications = Object.entries(day.paymentsApplied || {})
    .map(([paymentId, amount]) => ({ payment: payments.get(paymentId), paymentId, amount }))
    .filter(item => item.payment)
    .sort((left, right) => (
      String(right.payment.date || '').localeCompare(String(left.payment.date || ''))
      || String(right.payment.id).localeCompare(String(left.payment.id))
    ));
  const refundableCents = applications.reduce(
    (total, application) => total + toCents(application.amount || 0),
    0
  );
  if (refundableCents < refundNeededCents) return false;

  for (const { payment, paymentId, amount } of applications) {
    if (refundNeededCents === 0) break;
    const appliedCents = toCents(amount || 0);
    const refundCents = Math.min(refundNeededCents, appliedCents);

    payment.advanceRemaining = fromCents(toCents(payment.advanceRemaining || 0) + refundCents);
    day.amountPaid = fromCents(toCents(day.amountPaid || 0) - refundCents);
    const remainingApplication = appliedCents - refundCents;

    if (remainingApplication === 0) {
      delete day.paymentsApplied[paymentId];
      payment.coveredDays = (payment.coveredDays || []).filter(date => date !== day.date);
    } else {
      day.paymentsApplied[paymentId] = fromCents(remainingApplication);
    }
    refundNeededCents -= refundCents;
  }

  day.rate = fromCents(targetRateCents);
  refreshDayFinancials(day);
  return true;
}

export function allocatePaymentAcrossDays({
  amount,
  paymentId,
  primaryDays,
  secondaryDays = [],
  allowSecondaryDays = false
}) {
  let remainingCents = toCents(amount);
  if (remainingCents <= 0) throw new RangeError('O pagamento deve ser maior que zero.');

  const coveredDays = [];
  const eligibleDays = allowSecondaryDays ? [...primaryDays, ...secondaryDays] : [...primaryDays];

  for (const day of eligibleDays.sort((left, right) => left.date.localeCompare(right.date))) {
    refreshDayFinancials(day);
    if (!isFinancialDay(day) || remainingCents === 0) continue;

    const pendingCents = toCents(day.pendingAmount || 0);
    const appliedCents = Math.min(remainingCents, pendingCents);
    if (appliedCents <= 0) continue;

    day.amountPaid = fromCents(toCents(day.amountPaid || 0) + appliedCents);
    day.paymentsApplied ||= {};
    day.paymentsApplied[paymentId] = fromCents(
      toCents(day.paymentsApplied[paymentId] || 0) + appliedCents
    );
    refreshDayFinancials(day);
    coveredDays.push(day.date);
    remainingCents -= appliedCents;
  }

  return {
    advanceRemaining: fromCents(remainingCents),
    coveredDays: [...new Set(coveredDays)].sort()
  };
}

export function reversePayment(state, paymentId) {
  const paymentIndex = state.payments.findIndex(payment => payment.id === paymentId);
  if (paymentIndex === -1) return false;

  const payment = state.payments[paymentIndex];
  for (const date of payment.coveredDays || []) {
    const day = state.workedDays[date];
    if (!day?.paymentsApplied?.[paymentId]) continue;

    const appliedCents = toCents(day.paymentsApplied[paymentId]);
    day.amountPaid = fromCents(Math.max(0, toCents(day.amountPaid || 0) - appliedCents));
    delete day.paymentsApplied[paymentId];
    refreshDayFinancials(day);
  }

  state.payments.splice(paymentIndex, 1);
  return true;
}

export function validateLedgerInvariants(state) {
  const problems = [];
  const payments = new Map((state.payments || []).map(payment => [payment.id, payment]));
  const appliedByPayment = new Map();
  const coveredByPayment = new Map();

  for (const [date, day] of Object.entries(state.workedDays || {})) {
    const mappedCents = Object.entries(day.paymentsApplied || {}).reduce((total, [paymentId, amount]) => {
      if (!payments.has(paymentId)) problems.push(`Dia ${date} referencia pagamento inexistente ${paymentId}.`);
      const cents = toCents(amount || 0);
      appliedByPayment.set(paymentId, (appliedByPayment.get(paymentId) || 0) + cents);
      if (!coveredByPayment.has(paymentId)) coveredByPayment.set(paymentId, new Set());
      coveredByPayment.get(paymentId).add(date);
      return total + cents;
    }, 0);

    const unlinkedCents = toCents(day.unlinkedAmountPaid || 0);
    if (toCents(day.amountPaid || 0) !== mappedCents + unlinkedCents) {
      problems.push(`Dia ${date} possui valor pago diferente das aplicações.`);
    }
    const expectedPending = isFinancialDay(day)
      ? Math.max(0, toCents(day.rate || 0) - toCents(day.amountPaid || 0))
      : 0;
    if (toCents(day.pendingAmount || 0) !== expectedPending) {
      problems.push(`Dia ${date} possui pendência derivada incorreta.`);
    }
  }

  for (const payment of state.payments || []) {
    const appliedCents = appliedByPayment.get(payment.id) || 0;
    const advanceCents = toCents(payment.advanceRemaining || 0);
    if (appliedCents + advanceCents !== toCents(payment.amount)) {
      problems.push(`Pagamento ${payment.id} não fecha aplicações + crédito.`);
    }
    const expectedCovered = [...(coveredByPayment.get(payment.id) || [])].sort();
    const actualCovered = [...new Set(payment.coveredDays || [])].sort();
    if (JSON.stringify(expectedCovered) !== JSON.stringify(actualCovered)) {
      problems.push(`Pagamento ${payment.id} possui dias cobertos inconsistentes.`);
    }
  }

  return problems;
}

export function normalizePayment(payment) {
  payment.amount = normalizeMoney(payment.amount);
  payment.cashAmount = normalizeMoney(payment.cashAmount || 0);
  payment.depositAmount = normalizeMoney(payment.depositAmount || 0);
  payment.advanceRemaining = normalizeMoney(payment.advanceRemaining || 0);
  payment.coveredDays = [...new Set(payment.coveredDays || [])].sort();
  return payment;
}

export function reconcileLedger(state) {
  const repairs = [];
  const payments = new Map();
  for (const payment of state.payments || []) {
    normalizePayment(payment);
    payments.set(payment.id, payment);
  }

  const recalculateDay = day => {
    if (!isFinancialDay(day)) {
      day.amountPaid = 0;
      day.pendingAmount = 0;
      day.status = 'not-applicable';
      return;
    }
    const mappedCents = Object.values(day.paymentsApplied || {})
      .reduce((total, amount) => total + toCents(amount || 0), 0);
    const unlinkedCents = toCents(day.unlinkedAmountPaid || 0);
    day.amountPaid = fromCents(mappedCents + unlinkedCents);
    refreshDayFinancials(day);
  };

  for (const [date, day] of Object.entries(state.workedDays || {})) {
    day.rate = normalizeMoney(day.rate || 0);
    const previousPaidCents = toCents(day.amountPaid || 0);
    day.paymentsApplied = day.paymentsApplied && typeof day.paymentsApplied === 'object'
      ? day.paymentsApplied
      : {};

    let validMappedCents = 0;
    for (const [paymentId, amount] of Object.entries(day.paymentsApplied)) {
      const amountCents = Math.max(0, toCents(amount || 0));
      if (!payments.has(paymentId) || amountCents === 0) {
        delete day.paymentsApplied[paymentId];
        repairs.push(`application:${date}:${paymentId}`);
        continue;
      }
      day.paymentsApplied[paymentId] = fromCents(amountCents);
      validMappedCents += amountCents;
    }

    if (!isFinancialDay(day)) {
      if (previousPaidCents > 0) day.legacyAmountPaid = fromCents(previousPaidCents);
      for (const paymentId of Object.keys(day.paymentsApplied)) {
        delete day.paymentsApplied[paymentId];
        repairs.push(`non-financial:${date}:${paymentId}`);
      }
      delete day.unlinkedAmountPaid;
      recalculateDay(day);
      continue;
    }

    const rateCents = toCents(day.rate);
    let unlinkedCents = day.unlinkedAmountPaid === undefined
      ? Math.max(0, previousPaidCents - validMappedCents)
      : Math.max(0, toCents(day.unlinkedAmountPaid));
    if (unlinkedCents > rateCents) {
      day.legacyOverpayment = fromCents(unlinkedCents - rateCents);
      unlinkedCents = rateCents;
      repairs.push(`unlinked-overpayment:${date}`);
    }
    if (unlinkedCents > 0) day.unlinkedAmountPaid = fromCents(unlinkedCents);
    else delete day.unlinkedAmountPaid;

    let mappedCapacityCents = rateCents - unlinkedCents;
    const applicationsNewestFirst = Object.keys(day.paymentsApplied).sort((leftId, rightId) => {
      const left = payments.get(leftId);
      const right = payments.get(rightId);
      return String(right.date || '').localeCompare(String(left.date || ''))
        || String(right.id).localeCompare(String(left.id));
    });
    for (const paymentId of applicationsNewestFirst) {
      const appliedCents = toCents(day.paymentsApplied[paymentId]);
      if (validMappedCents <= mappedCapacityCents) break;
      const reductionCents = Math.min(appliedCents, validMappedCents - mappedCapacityCents);
      const nextCents = appliedCents - reductionCents;
      if (nextCents === 0) delete day.paymentsApplied[paymentId];
      else day.paymentsApplied[paymentId] = fromCents(nextCents);
      validMappedCents -= reductionCents;
      repairs.push(`day-overpayment:${date}:${paymentId}`);
    }
    recalculateDay(day);
  }

  for (const payment of state.payments || []) {
    const applications = [];
    for (const [date, day] of Object.entries(state.workedDays || {})) {
      const amount = day.paymentsApplied?.[payment.id];
      if (amount) applications.push({ date, day, cents: toCents(amount) });
    }
    applications.sort((left, right) => right.date.localeCompare(left.date));

    let appliedCents = applications.reduce((total, item) => total + item.cents, 0);
    const amountCents = toCents(payment.amount);
    for (const application of applications) {
      if (appliedCents <= amountCents) break;
      const reductionCents = Math.min(application.cents, appliedCents - amountCents);
      const nextCents = application.cents - reductionCents;
      if (nextCents === 0) delete application.day.paymentsApplied[payment.id];
      else application.day.paymentsApplied[payment.id] = fromCents(nextCents);
      appliedCents -= reductionCents;
      recalculateDay(application.day);
      repairs.push(`payment-overallocation:${payment.id}:${application.date}`);
    }

    payment.advanceRemaining = fromCents(amountCents - appliedCents);
    payment.coveredDays = Object.entries(state.workedDays || {})
      .filter(([, day]) => toCents(day.paymentsApplied?.[payment.id] || 0) > 0)
      .map(([date]) => date)
      .sort();
  }

  return { state, repairs };
}
