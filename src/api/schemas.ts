// What the API sends back, checked at the edge so the UI never trusts an unchecked shape.
// Types come from src/domain/types.ts where they already exist; zod only proves the JSON matches them.
import { z } from 'zod';
import { FESTIVAL_DAYS, GARBA_DAYS, ITEM_IDS, PROMO_CODES } from '../domain/catalog';
import type { Quote, RuleError } from '../domain/types';

const cents = z.number().int();

const quoteLine = z.object({
  itemId: z.enum(ITEM_IDS),
  label: z.string(),
  attendeeId: z.string().optional(),
  day: z.enum(FESTIVAL_DAYS).optional(),
  qty: z.number().int(),
  unitCents: cents,
  totalCents: cents,
});

const promoResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('none') }),
  z.object({
    status: z.literal('applied'),
    code: z.enum(PROMO_CODES),
    kind: z.enum(['percent', 'flat', 'kids-free']),
    value: z.number(),
    message: z.string(),
  }),
  z.object({
    status: z.enum(['unknown', 'expired', 'exhausted', 'not-applicable']),
    code: z.string(),
    message: z.string(),
  }),
]);

export const quoteSchema: z.ZodType<Quote> = z.object({
  lines: z.array(quoteLine),
  subtotalCents: cents,
  discountCents: cents,
  totalCents: cents,
  promo: promoResult,
  hints: z.array(z.string()),
  stockNeeded: z.partialRecord(z.enum(ITEM_IDS), z.number()),
});

export const quoteResponseSchema = z.object({ quote: quoteSchema });

const catalogItem = z.object({
  id: z.enum(ITEM_IDS),
  label: z.string(),
  priceCents: cents,
  unit: z.string(),
  remaining: z.number().int(),
  soldOut: z.boolean(),
});
export type CatalogItemView = z.infer<typeof catalogItem>;

export const catalogSchema = z.object({
  days: z.array(z.enum(FESTIVAL_DAYS)),
  garbaDays: z.array(z.enum(GARBA_DAYS)),
  items: z.array(catalogItem),
});
export type CatalogView = z.infer<typeof catalogSchema>;

export const bookingResultSchema = z.object({
  bookingId: z.string(),
  reference: z.string(),
  amountCents: cents,
  quote: quoteSchema,
});
export type BookingResult = z.infer<typeof bookingResultSchema>;

export const savedBookingSchema = z.object({
  bookingId: z.string(),
  reference: z.string(),
  booker: z.object({ name: z.string(), email: z.string() }),
  attendees: z.array(z.object({ name: z.string(), ticket: z.string() })),
  quote: quoteSchema,
  createdAt: z.string(),
});
export type SavedBooking = z.infer<typeof savedBookingSchema>;

const ruleError: z.ZodType<RuleError> = z.object({ code: z.string(), path: z.string(), message: z.string() });

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.array(ruleError).optional(),
  }),
});
