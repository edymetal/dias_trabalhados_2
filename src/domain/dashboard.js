import {
  formatDateISO,
  getNextPaymentDate,
  getWeekRange,
  isValidISODate,
  parseLocalDate
} from './dates.js';
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
  return sumEntriesInMonth(entries.filter(isFinancialDay), referenceDate, day => day.amountPaid);
}

export function calculateAccumulatedInMonth(workedDays, referenceDate = new Date()) {
  const entries = Object.entries(workedDays || {}).map(([date, day]) => ({ date, ...day }));
  return sumEntriesInMonth(
    entries.filter(isFinancialDay),
    referenceDate,
    day => fromCents(toCents(day.amountPaid || 0) + toCents(day.pendingAmount || 0))
  );
}

export function calculateReceivedByMonthInYear(workedDays, year = new Date().getFullYear()) {
  const monthlyCents = Array(12).fill(0);
  const yearPrefix = `${year}-`;

  for (const [date, day] of Object.entries(workedDays || {})) {
    if (!date.startsWith(yearPrefix) || !isFinancialDay(day)) continue;
    const monthIndex = Number.parseInt(date.slice(5, 7), 10) - 1;
    if (monthIndex < 0 || monthIndex > 11) continue;
    monthlyCents[monthIndex] += toCents(day.amountPaid || 0);
  }

  return monthlyCents.map(fromCents);
}

export function calculateExpectedPaymentDate(workedDate, cycle) {
  const parsedWorkedDate = parseLocalDate(workedDate);
  if (!parsedWorkedDate) return null;

  const normalizedCycle = cycle?.type === 'monthly'
    ? { type: 'monthly', day: cycle.day }
    : { type: 'weekly', day: cycle?.day ?? 0 };

  return formatDateISO(getNextPaymentDate(normalizedCycle, parsedWorkedDate));
}

function calculateDaysBetween(startDate, endDate) {
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  return Math.round(
    (Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay))
      / 86_400_000
  );
}

export function calculatePaymentDelaySummary(state, year = new Date().getFullYear()) {
  const reportYear = Number.isInteger(year) ? year : new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, monthIndex) => ({
    monthIndex,
    delayCount: 0,
    expectedAmount: 0,
    averageDaysLate: 0,
    maxDaysLate: 0,
    events: []
  }));
  const cycle = state?.settings?.paymentCycle || { type: 'weekly', day: 0 };
  const paymentsById = new Map(
    (state?.payments || [])
      .filter(payment => payment?.id !== undefined && payment?.id !== null)
      .map(payment => [String(payment.id), payment])
  );
  const groupedEvents = new Map();

  for (const [workedDate, day] of Object.entries(state?.workedDays || {})) {
    if (!isFinancialDay(day) || !isValidISODate(workedDate)) continue;
    const dueDate = calculateExpectedPaymentDate(workedDate, cycle);
    if (!dueDate || !dueDate.startsWith(`${reportYear}-`)) continue;

    for (const [paymentId, appliedAmount] of Object.entries(day.paymentsApplied || {})) {
      const amountCents = toCents(appliedAmount || 0);
      const payment = paymentsById.get(String(paymentId));
      if (amountCents <= 0 || !payment || !isValidISODate(payment.date) || payment.date <= dueDate) continue;

      const eventKey = `${dueDate}:${paymentId}`;
      if (!groupedEvents.has(eventKey)) {
        groupedEvents.set(eventKey, {
          paymentId: String(paymentId),
          dueDate,
          paymentDate: payment.date,
          amountCents: 0,
          daysLate: calculateDaysBetween(dueDate, payment.date),
          coveredDays: new Set()
        });
      }

      const event = groupedEvents.get(eventKey);
      event.amountCents += amountCents;
      event.coveredDays.add(workedDate);
    }
  }

  const events = [...groupedEvents.values()]
    .sort((left, right) => (
      left.dueDate.localeCompare(right.dueDate)
      || left.paymentDate.localeCompare(right.paymentDate)
      || left.paymentId.localeCompare(right.paymentId)
    ))
    .map(event => ({
      paymentId: event.paymentId,
      dueDate: event.dueDate,
      paymentDate: event.paymentDate,
      amount: fromCents(event.amountCents),
      daysLate: event.daysLate,
      coveredDays: event.coveredDays.size
    }));

  for (const event of events) {
    const monthIndex = Number.parseInt(event.dueDate.slice(5, 7), 10) - 1;
    if (monthIndex < 0 || monthIndex > 11) continue;
    months[monthIndex].events.push(event);
  }

  let totalAmountCents = 0;
  let totalDelayCount = 0;
  for (const month of months) {
    const monthAmountCents = month.events.reduce((total, event) => total + toCents(event.amount), 0);
    const totalDaysLate = month.events.reduce((total, event) => total + event.daysLate, 0);
    month.delayCount = month.events.length;
    month.expectedAmount = fromCents(monthAmountCents);
    month.averageDaysLate = month.delayCount > 0
      ? Math.round((totalDaysLate / month.delayCount) * 10) / 10
      : 0;
    month.maxDaysLate = month.events.reduce((maximum, event) => Math.max(maximum, event.daysLate), 0);
    totalAmountCents += monthAmountCents;
    totalDelayCount += month.delayCount;
  }

  const mostProblematicMonth = months.reduce((current, month) => {
    if (month.delayCount === 0) return current;
    if (!current) return month;
    if (toCents(month.expectedAmount) !== toCents(current.expectedAmount)) {
      return toCents(month.expectedAmount) > toCents(current.expectedAmount) ? month : current;
    }
    if (month.delayCount !== current.delayCount) {
      return month.delayCount > current.delayCount ? month : current;
    }
    return month.maxDaysLate > current.maxDaysLate ? month : current;
  }, null);

  return {
    year: reportYear,
    delayCount: totalDelayCount,
    expectedAmount: fromCents(totalAmountCents),
    mostProblematicMonth,
    months
  };
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
    receivedThisMonth: calculateReceivedForWorkedDaysInMonth(state.workedDays, referenceDate),
    accumulatedThisMonth: calculateAccumulatedInMonth(state.workedDays, referenceDate),
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
