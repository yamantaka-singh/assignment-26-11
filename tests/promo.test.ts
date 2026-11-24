import { describe, it, expect } from 'vite-plus/test';
import { PROMO_SEED, evaluatePromo, normalizePromoCode } from '../src/domain/promo';
import type { PromoRecord } from '../src/domain/types';

const NOW = new Date('2026-11-24T12:00:00Z');
const record = (code: string): PromoRecord | undefined => PROMO_SEED.find((p) => p.code === code);

describe('normalizePromoCode', () => {
  it('trims and uppercases', () => {
    expect(normalizePromoCode('  seva10 ')).toBe('SEVA10');
  });
  it('returns undefined for empty, blank and missing input', () => {
    expect(normalizePromoCode('')).toBeUndefined();
    expect(normalizePromoCode('   ')).toBeUndefined();
    expect(normalizePromoCode(undefined)).toBeUndefined();
  });
});

describe('PROMO_SEED', () => {
  it('contains the five documented codes', () => {
    expect(PROMO_SEED.map((p) => p.code)).toEqual(['SEVA10', 'FLAT20', 'KIDSFREE', 'EXPIRED5', 'MAXEDOUT']);
  });
  it('uses integer cents for the flat code', () => {
    expect(record('FLAT20')).toMatchObject({ kind: 'flat', value: 2000 });
  });
});

describe('evaluatePromo', () => {
  it('is "none" when no code was entered', () => {
    expect(evaluatePromo(undefined, NOW, undefined)).toEqual({ status: 'none' });
    expect(evaluatePromo('   ', NOW, undefined)).toEqual({ status: 'none' });
  });

  it('is "unknown" with a friendly message when the code does not exist', () => {
    const r = evaluatePromo('nope', NOW, undefined);
    expect(r).toMatchObject({ status: 'unknown', code: 'NOPE' });
    expect(r.status === 'unknown' && r.message).toBe(
      "We don't recognise that code — please check the spelling. Your booking will go ahead without a discount.",
    );
  });

  it('applies a valid code, case-insensitively with surrounding spaces', () => {
    const r = evaluatePromo(' seva10 ', NOW, record('SEVA10'));
    expect(r).toMatchObject({ status: 'applied', code: 'SEVA10', kind: 'percent', value: 10 });
  });

  it('applies flat and kids-free codes', () => {
    expect(evaluatePromo('FLAT20', NOW, record('FLAT20'))).toMatchObject({ status: 'applied', kind: 'flat', value: 2000 });
    expect(evaluatePromo('KIDSFREE', NOW, record('KIDSFREE'))).toMatchObject({ status: 'applied', kind: 'kids-free' });
  });

  it('is "expired" after the expiry instant', () => {
    const r = evaluatePromo('EXPIRED5', NOW, record('EXPIRED5'));
    expect(r).toMatchObject({ status: 'expired', code: 'EXPIRED5' });
  });

  it('is still valid at the exact expiry instant', () => {
    const r = evaluatePromo('EXPIRED5', new Date('2026-10-31T23:59:59Z'), record('EXPIRED5'));
    expect(r.status).toBe('applied');
  });

  it('is "exhausted" when uses reached maxUses', () => {
    const r = evaluatePromo('MAXEDOUT', NOW, record('MAXEDOUT'));
    expect(r).toMatchObject({ status: 'exhausted', code: 'MAXEDOUT' });
  });

  it('is still applied when one use remains', () => {
    const last = { ...record('MAXEDOUT')!, uses: 49 };
    expect(evaluatePromo('MAXEDOUT', NOW, last).status).toBe('applied');
  });

  it('never scolds: every failure message says the booking goes ahead', () => {
    const messages = [
      evaluatePromo('X', NOW, undefined),
      evaluatePromo('EXPIRED5', NOW, record('EXPIRED5')),
      evaluatePromo('MAXEDOUT', NOW, record('MAXEDOUT')),
    ].map((r) => (r.status === 'none' ? '' : r.message));
    for (const m of messages) expect(m).toMatch(/without a discount/);
  });
});
