import { describe, expect, it } from 'vitest';
import {
  addDaysISO,
  formatDateISO,
  formatDateStringDisplay,
  getNextPaymentDate,
  getWeekRange,
  isValidISODate,
  listDateRange,
  parseLocalDate
} from '../../src/domain/dates.js';

describe('datas locais', () => {
  it('formata e interpreta a data sem conversão UTC', () => {
    const date = parseLocalDate('2026-05-21');

    expect(formatDateISO(date)).toBe('2026-05-21');
    expect(formatDateStringDisplay('2026-05-21')).toBe('21/05/2026');
  });

  it.each([
    ['2026-05-18', '2026-05-18', '2026-05-24'],
    ['2026-05-21', '2026-05-18', '2026-05-24'],
    ['2026-05-24', '2026-05-18', '2026-05-24']
  ])('agrupa %s na semana de segunda a domingo', (input, monday, sunday) => {
    const week = getWeekRange(input);

    expect(week.mondayStr).toBe(monday);
    expect(week.sundayStr).toBe(sunday);
    expect(week.key).toBe(`${monday}_${sunday}`);
  });

  it('atravessa corretamente a virada do ano', () => {
    expect(getWeekRange('2027-01-01')).toMatchObject({
      mondayStr: '2026-12-28',
      sundayStr: '2027-01-03'
    });
  });

  it('rejeita datas inexistentes e itera sem depender de horário de verão', () => {
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2028-02-29')).toBe(true);
    expect(parseLocalDate('2026-02-31')).toBeNull();
    expect(addDaysISO('2026-03-28', 1)).toBe('2026-03-29');
    expect(listDateRange('2026-10-24', '2026-10-27')).toEqual([
      '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'
    ]);
  });

  it('limita o dia mensal ao último dia válido', () => {
    expect(formatDateISO(getNextPaymentDate(
      { type: 'monthly', day: 31 },
      new Date(2026, 1, 10)
    ))).toBe('2026-02-28');

    expect(formatDateISO(getNextPaymentDate(
      { type: 'monthly', day: 31 },
      new Date(2026, 1, 28)
    ))).toBe('2026-02-28');
  });
});
