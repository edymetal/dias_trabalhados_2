import { addDaysISO, isValidISODate, listDateRange } from './dates.js';

export const DEFAULT_AUTOFILL_PAGE_SIZE = 31;

export function getAutoFillBatch({
  settings,
  workedDays,
  todayISO,
  pageSize = DEFAULT_AUTOFILL_PAGE_SIZE
}) {
  if (!settings?.autoFillWorkedDays || !isValidISODate(todayISO)) {
    return { dates: [], cursor: settings?.autoFillLastDate || null, complete: true };
  }

  const start = isValidISODate(settings.autoFillLastDate)
    ? addDaysISO(settings.autoFillLastDate, 1)
    : (isValidISODate(settings.autoFillStartedAt) ? settings.autoFillStartedAt : todayISO);

  if (start > todayISO) {
    return { dates: [], cursor: settings.autoFillLastDate || todayISO, complete: true };
  }

  const scannedDates = listDateRange(start, todayISO, Math.max(1, pageSize));
  const dates = scannedDates.filter(date => !workedDays?.[date]);
  const cursor = scannedDates.at(-1) || settings.autoFillLastDate || null;

  return {
    dates,
    cursor,
    complete: cursor === todayISO
  };
}
