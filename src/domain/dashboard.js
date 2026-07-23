import { formatDateISO, getWeekRange } from './dates.js';
import { isFinancialDay } from './ledger.js';
import { fromCents, toCents } from './money.js';

export function getMonthDateRange(referenceDate = new Date()) {
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);

  return {
    startStr: formatDateISO(monthStart),
    endStr: formatDateISO(monthEnd)
  };
}

function sumEntriesInMonth(entries, referenceDate, readAmount) {
  const { startStr, endStr } = getMonthDateRange(referenceDate);
  const cents = entries.reduce((total, entry) => {
    const date = entry.date;
    if (!date || date < startStr || date > endStr) return total;
    return total + toCents(readAmount(entry) || 0);
  }, 0);
  return fromCents(cents);
}

export function calculateReceivedForWorkedDaysInMonth(workedDays, referenceDate = new Date()) {
  const entries = Object.entries(workedDays || {}).map(([date, day]) => ({ date, ...day }));
  return sumEntriesInMonth(entries, referenceDate, day => day.amountPaid);
}

export function calculateCashReceivedInMonth(payments, referenceDate = new Date()) {
  return sumEntriesInMonth(payments || [], referenceDate, payment => payment.amount);
}

export function calculateEarnedInMonth(workedDays, referenceDate = new Date()) {
  const entries = Object.entries(workedDays || {}).map(([date, day]) => ({ date, ...day }));
  return sumEntriesInMonth(
    entries.filter(isFinancialDay),
    referenceDate,
    day => day.rate
  );
}

export function calculateFinancialSummary(state, referenceDate = new Date()) {
  const todayISO = formatDateISO(referenceDate);
  const currentWeek = getWeekRange(todayISO);
  let earningsCents = 0;
  let paidCents = 0;
  let pendingCents = 0;
  let weekEarningsCents = 0;

  for (const [date, day] of Object.entries(state.workedDays || {})) {
    if (!isFinancialDay(day)) continue;
    earningsCents += toCents(day.rate || 0);
    paidCents += toCents(day.amountPaid || 0);
    pendingCents += toCents(day.pendingAmount || 0);
    if (date >= currentWeek.mondayStr && date <= currentWeek.sundayStr) {
      weekEarningsCents += toCents(day.rate || 0);
    }
  }

  const creditCents = (state.payments || []).reduce(
    (total, payment) => total + toCents(payment.advanceRemaining || 0),
    0
  );

  return {
    totalEarnings: fromCents(earningsCents),
    totalPaidByCompetence: fromCents(paidCents),
    totalPending: fromCents(pendingCents),
    totalAdvance: fromCents(creditCents),
    netBalance: fromCents(pendingCents - creditCents),
    thisWeekEarnings: fromCents(weekEarningsCents),
    receivedThisMonthCash: calculateCashReceivedInMonth(state.payments, referenceDate),
    earnedThisMonth: calculateEarnedInMonth(state.workedDays, referenceDate)
  };
}

export function splitPaymentMethod(payment) {
  const amountCents = toCents(payment?.amount || 0);
  if (amountCents <= 0) return { cashRatio: 0, depositRatio: 0 };

  if (payment.cashAmount !== undefined && payment.depositAmount !== undefined) {
    return {
      cashRatio: toCents(payment.cashAmount || 0) / amountCents,
      depositRatio: toCents(payment.depositAmount || 0) / amountCents
    };
  }

  const notes = (payment.notes || '').toLowerCase();
  const method = payment.method || '';
  if (method === 'Dinheiro' || method === 'Contanti' || notes.includes('dinheiro') || notes.includes('contanti')) {
    return { cashRatio: 1, depositRatio: 0 };
  }
  if (method === 'Depósito' || method === 'Deposito' || notes.includes('depósito') || notes.includes('deposito')) {
    return { cashRatio: 0, depositRatio: 1 };
  }
  if (notes.includes('misto')) {
    const cashMatch = notes.match(/(?:dinheiro|contanti):\s*[^0-9]*([0-9]+(?:[.,][0-9]{2})?)/);
    const depositMatch = notes.match(/(?:depósito|deposito):\s*[^0-9]*([0-9]+(?:[.,][0-9]{2})?)/);
    const cashCents = cashMatch ? toCents(cashMatch[1]) : Math.floor(amountCents / 2);
    const depositCents = depositMatch ? toCents(depositMatch[1]) : amountCents - cashCents;
    return { cashRatio: cashCents / amountCents, depositRatio: depositCents / amountCents };
  }

  return { cashRatio: 0, depositRatio: 1 };
}
