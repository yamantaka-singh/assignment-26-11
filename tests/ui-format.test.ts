import { describe, expect, it } from 'vite-plus/test';
import { FESTIVAL_DAYS, formatFestivalDay } from '../src/domain/catalog';
import { formatCents } from '../src/ui/components/MoneyText';

describe('formatCents', () => {
  it.each([
    [0, '$0.00'],
    [14670, '$146.70'],
    [5, '$0.05'],
    [123456, '$1,234.56'],
  ])('formats %i cents as %s', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });
});

describe('formatFestivalDay', () => {
  it('writes every festival day as weekday, day, month', () => {
    expect(FESTIVAL_DAYS.map(formatFestivalDay)).toEqual(['Tue 10 Nov', 'Wed 11 Nov', 'Thu 12 Nov', 'Fri 13 Nov', 'Sat 14 Nov']);
  });
});
