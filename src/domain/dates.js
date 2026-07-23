export function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidISODate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function formatDateDisplay(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

export function formatDateStringDisplay(dateISO) {
  if (!isValidISODate(dateISO)) return '';
  const [year, month, day] = dateISO.split('-');
  return `${day}/${month}/${year}`;
}

export function parseLocalDate(dateStr) {
  if (!isValidISODate(dateStr)) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addDaysISO(dateStr, amount) {
  if (!isValidISODate(dateStr) || !Number.isInteger(amount)) {
    throw new TypeError('Data ou quantidade de dias inválida.');
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

export function getWeekRange(dateStr) {
  if (!isValidISODate(dateStr)) throw new TypeError('Data inválida para calcular a semana.');
  const date = parseLocalDate(dateStr);
  const dayOfWeek = date.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const mondayStr = addDaysISO(dateStr, diffToMonday);
  const sundayStr = addDaysISO(mondayStr, 6);

  return {
    mondayStr,
    sundayStr,
    key: `${mondayStr}_${sundayStr}`,
    label: `${formatDateDisplay(parseLocalDate(mondayStr))} a ${formatDateDisplay(parseLocalDate(sundayStr))}`
  };
}

export function listDateRange(startStr, endStr, limit = 366) {
  if (!isValidISODate(startStr) || !isValidISODate(endStr) || startStr > endStr) return [];
  const dates = [];
  let current = startStr;
  while (current <= endStr && dates.length < limit) {
    dates.push(current);
    current = addDaysISO(current, 1);
  }
  return dates;
}

export function getNextPaymentDate(cycle, referenceDate = new Date()) {
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 12);
  if (cycle?.type === 'weekly') {
    const targetDay = Math.max(0, Math.min(6, Number(cycle.day) || 0));
    const offset = (targetDay - today.getDay() + 7) % 7;
    return parseLocalDate(addDaysISO(formatDateISO(today), offset));
  }

  const requestedDay = Math.max(1, Math.min(31, Number(cycle?.day) || 1));
  let year = today.getFullYear();
  let month = today.getMonth();
  let lastDay = new Date(year, month + 1, 0, 12).getDate();
  let candidate = new Date(year, month, Math.min(requestedDay, lastDay), 12);
  if (candidate < today) {
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
    lastDay = new Date(year, month + 1, 0, 12).getDate();
    candidate = new Date(year, month, Math.min(requestedDay, lastDay), 12);
  }
  return candidate;
}
