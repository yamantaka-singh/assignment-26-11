import type { PromoRecord, PromoResult } from './types';

/** Seed data for the D1 promo_codes table. The server owns `uses`; this is only the starting state. */
export const PROMO_SEED: readonly PromoRecord[] = [
  { code: 'SEVA10', kind: 'percent', value: 10, expiresAt: null, maxUses: null, uses: 0 },
  { code: 'FLAT20', kind: 'flat', value: 2000, expiresAt: null, maxUses: null, uses: 0 },
  { code: 'KIDSFREE', kind: 'kids-free', value: 0, expiresAt: null, maxUses: null, uses: 0 },
  { code: 'EXPIRED5', kind: 'percent', value: 5, expiresAt: '2026-10-31T23:59:59Z', maxUses: null, uses: 0 },
  { code: 'MAXEDOUT', kind: 'percent', value: 15, expiresAt: null, maxUses: 50, uses: 50 },
];

const NO_DISCOUNT = 'Your booking will go ahead without a discount.';

export function normalizePromoCode(raw: string | undefined): string | undefined {
  const code = raw?.trim().toUpperCase();
  return code ? code : undefined;
}

export function evaluatePromo(rawCode: string | undefined, now: Date, record: PromoRecord | undefined): PromoResult {
  const code = normalizePromoCode(rawCode);
  if (code === undefined) return { status: 'none' };
  if (record === undefined) {
    return { status: 'unknown', code, message: `We don't recognise that code — please check the spelling. ${NO_DISCOUNT}` };
  }
  if (record.expiresAt !== null && now.getTime() > Date.parse(record.expiresAt)) {
    return { status: 'expired', code, message: `${code} has expired, but thanks for trying it! ${NO_DISCOUNT}` };
  }
  if (record.maxUses !== null && record.uses >= record.maxUses) {
    return { status: 'exhausted', code, message: `${code} has been fully claimed, sorry about that. ${NO_DISCOUNT}` };
  }
  return {
    status: 'applied',
    code: record.code,
    kind: record.kind,
    value: record.value,
    message: `${record.code} applied.`,
  };
}
