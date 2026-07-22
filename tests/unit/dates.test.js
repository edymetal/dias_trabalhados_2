import { describe, expect, it } from 'vitest';
import {
  formatDateISO,
  formatDateStringDisplay,
  getWeekRange,
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
});
