import { describe, expect, it } from 'vite-plus/test';
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
