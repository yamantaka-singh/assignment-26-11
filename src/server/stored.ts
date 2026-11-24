// Reads booking rows back from storage. Stored JSON is parsed against schemas, never cast:
// a corrupt row throws a named error (the route logs it and answers 500) instead of flowing on with wrong types.
import { z } from 'zod';
import { FESTIVAL_DAYS, ITEM_IDS, PROMO_CODES } from '../domain/catalog';
import { attendeeSchema, bookerSchema } from '../domain/schema';
import type { Attendee, Booker, Quote } from '../domain/types';

const itemId = z.enum(ITEM_IDS);
const promoKind = z.enum(['percent', 'flat', 'kids-free']);

const promoSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('none') }),
  z.object({ status: z.literal('applied'), code: z.enum(PROMO_CODES), kind: promoKind, value: z.number(), message: z.string() }),
  z.object({ status: z.enum(['unknown', 'expired', 'exhausted', 'not-applicable']), code: z.string(), message: z.string() }),
]);

const quoteSchema = z.object({
  lines: z.array(
    z.object({
      itemId,
      label: z.string(),
      attendeeId: z.string().optional(),
      day: z.enum(FESTIVAL_DAYS).optional(),
      qty: z.number(),
      unitCents: z.number(),
      totalCents: z.number(),
    }),
  ),
  subtotalCents: z.number(),
  discountCents: z.number(),
  totalCents: z.number(),
  promo: promoSchema,
  hints: z.array(z.string()),
  stockNeeded: z.partialRecord(itemId, z.number()),
});

export interface StoredBookingRow {
  readonly bookerJson: string;
  readonly attendeesJson: string;
  readonly quoteJson: string;
}

function parseColumn<T>(field: keyof StoredBookingRow, text: string, schema: z.ZodType<T>): T {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`stored ${field} is corrupt: not valid JSON`);
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Paths only: values may be personal data and must not reach the logs.
  const paths = parsed.error.issues.map((i) => i.path.join('.') || '(root)').join(', ');
  throw new Error(`stored ${field} is corrupt: unexpected shape at ${paths}`);
}

export function parseStoredBooking(row: StoredBookingRow): { booker: Booker; attendees: readonly Attendee[]; quote: Quote } {
  return {
    booker: parseColumn('bookerJson', row.bookerJson, bookerSchema),
    attendees: parseColumn('attendeesJson', row.attendeesJson, z.array(attendeeSchema)),
    quote: parseColumn('quoteJson', row.quoteJson, quoteSchema),
  };
}
