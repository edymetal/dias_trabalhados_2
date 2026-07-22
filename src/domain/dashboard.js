import { formatDateISO } from './dates.js';

export function getMonthDateRange(referenceDate = new Date()) {
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);

  return {
    startStr: formatDateISO(monthStart),
    endStr: formatDateISO(monthEnd)
  };
}

export function calculateReceivedForWorkedDaysInMonth(workedDays, referenceDate = new Date()) {
  const { startStr, endStr } = getMonthDateRange(referenceDate);

  return Object.entries(workedDays || {}).reduce((total, [dateStr, dayData]) => {
    if (dateStr < startStr || dateStr > endStr) return total;
    return total + (dayData.amountPaid || 0);
  }, 0);
}

export function splitPaymentMethod(payment) {
  if (!payment?.amount) return { cashRatio: 0, depositRatio: 0 };

  if (payment.cashAmount !== undefined && payment.depositAmount !== undefined) {
    return {
      cashRatio: payment.cashAmount / payment.amount,
      depositRatio: payment.depositAmount / payment.amount
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
    const cash = cashMatch ? Number.parseFloat(cashMatch[1].replace(',', '.')) : payment.amount / 2;
    const deposit = depositMatch ? Number.parseFloat(depositMatch[1].replace(',', '.')) : payment.amount / 2;
    return { cashRatio: cash / payment.amount, depositRatio: deposit / payment.amount };
  }

  return { cashRatio: 0, depositRatio: 1 };
}
