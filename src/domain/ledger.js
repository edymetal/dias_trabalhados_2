export function applyAdvanceCreditsToDay(state, day) {
  if (day.period === 'none' || day.period === 'off') return;

  day.pendingAmount = Math.max(0, day.rate - (day.amountPaid || 0));
  if (day.pendingAmount <= 0) return;

  const paymentsWithAdvance = state.payments
    .filter(payment => (payment.advanceRemaining || 0) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const payment of paymentsWithAdvance) {
    if (day.pendingAmount <= 0) break;

    const appliedAmount = Math.min(payment.advanceRemaining, day.pendingAmount);
    day.amountPaid = (day.amountPaid || 0) + appliedAmount;
    day.pendingAmount -= appliedAmount;
    day.status = day.pendingAmount <= 0 ? 'paid' : 'partial';

    if (!day.paymentsApplied) day.paymentsApplied = {};
    day.paymentsApplied[payment.id] = (day.paymentsApplied[payment.id] || 0) + appliedAmount;

    if (!payment.coveredDays) payment.coveredDays = [];
    if (!payment.coveredDays.includes(day.date)) {
      payment.coveredDays.push(day.date);
    }

    payment.advanceRemaining -= appliedAmount;
  }
}

export function refundPaymentCreditsFromDay(state, day, newRate) {
  if (!day.paymentsApplied || Object.keys(day.paymentsApplied).length === 0) return;

  let refundNeeded = day.amountPaid - newRate;
  if (refundNeeded <= 0) return;

  for (const paymentId of Object.keys(day.paymentsApplied)) {
    if (refundNeeded <= 0) break;

    const appliedAmount = day.paymentsApplied[paymentId];
    if (appliedAmount <= 0) continue;

    const refund = Math.min(refundNeeded, appliedAmount);
    const payment = state.payments.find(item => item.id === paymentId);

    if (!payment) continue;

    payment.advanceRemaining = (payment.advanceRemaining || 0) + refund;
    day.amountPaid -= refund;
    day.paymentsApplied[paymentId] -= refund;

    if (day.paymentsApplied[paymentId] <= 0) {
      delete day.paymentsApplied[paymentId];
      payment.coveredDays = (payment.coveredDays || []).filter(date => date !== day.date);
    }

    refundNeeded -= refund;
  }

  day.pendingAmount = Math.max(0, newRate - day.amountPaid);
  day.status = day.amountPaid >= newRate ? 'paid' : (day.amountPaid > 0 ? 'partial' : 'unpaid');
}

export function allocatePaymentAcrossDays({ amount, paymentId, primaryDays, secondaryDays = [] }) {
  let remaining = amount;
  const coveredDays = [];

  for (const day of [...primaryDays, ...secondaryDays]) {
    if (remaining <= 0) break;

    const appliedAmount = Math.min(remaining, day.pendingAmount);
    day.amountPaid = (day.amountPaid || 0) + appliedAmount;
    day.pendingAmount -= appliedAmount;
    day.status = day.pendingAmount <= 0 ? 'paid' : 'partial';

    if (!day.paymentsApplied) day.paymentsApplied = {};
    day.paymentsApplied[paymentId] = (day.paymentsApplied[paymentId] || 0) + appliedAmount;
    coveredDays.push(day.date);
    remaining -= appliedAmount;
  }

  return { advanceRemaining: remaining, coveredDays };
}

export function reversePayment(state, paymentId) {
  const paymentIndex = state.payments.findIndex(payment => payment.id === paymentId);
  if (paymentIndex === -1) return false;

  const payment = state.payments[paymentIndex];

  for (const date of payment.coveredDays || []) {
    const day = state.workedDays[date];
    if (!day?.paymentsApplied?.[paymentId]) continue;

    const amount = day.paymentsApplied[paymentId];
    day.amountPaid -= amount;
    day.pendingAmount += amount;
    delete day.paymentsApplied[paymentId];
    day.status = day.amountPaid === 0 ? 'unpaid' : 'partial';
  }

  state.payments.splice(paymentIndex, 1);
  return true;
}
