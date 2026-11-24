// POST /api/bookings as a pure-ish service: all I/O goes through `repo`, so tests inject a fake.
import { z } from 'zod';
import type { ApiError, Quote } from '../domain/types';
import { hashRequest } from './hash';
import { MISSING_MESSAGE, simulatePayment } from './payment';
import { buildQuote } from './quote';
import { newReference } from './reference';
import type { BookingRecord, Repo } from './repo';
import { stockErrors } from './stock';

export interface BookingResult {
  readonly bookingId: string;
  readonly reference: string;
  readonly amountCents: number;
  readonly quote: Quote;
}

export type FailureStatus = 400 | 402 | 409 | 422;
export interface Failure {
  readonly ok: false;
  readonly status: FailureStatus;
  readonly error: ApiError['error'];
}
export type BookingOutcome = { readonly ok: true; readonly replay: boolean; readonly result: BookingResult } | Failure;

const fail = (status: FailureStatus, code: string, message: string, fields?: ApiError['error']['fields']): Failure => ({
  ok: false,
  status,
  error: fields === undefined ? { code, message } : { code, message, fields },
});

// The booking itself is validated by validateBooking (rich, field-level errors); this is only the wrapper.
const envelopeSchema = z.strictObject({
  booking: z.unknown(),
  payment: z.strictObject({ cardNumber: z.string().max(40) }).optional(),
});

const toResult = (r: BookingRecord): BookingResult => ({
  bookingId: r.id,
  reference: r.reference,
  amountCents: r.amountCents,
  quote: r.quote,
});

/** A stored booking under this key: same request -> replay it; different request -> the key was reused. */
function replayOf(existing: BookingRecord, requestHash: string): BookingOutcome {
  return existing.requestHash === requestHash
    ? { ok: true, replay: true, result: toResult(existing) }
    : fail(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different booking. Please start a new checkout.');
}

export async function createBooking(
  repo: Repo,
  request: { readonly idempotencyKey: string; readonly body: unknown },
  now: Date,
): Promise<BookingOutcome> {
  const envelope = envelopeSchema.safeParse(request.body);
  if (!envelope.success) {
    return fail(400, 'INVALID_REQUEST', 'The request should look like { booking, payment? } with nothing else in it.');
  }
  const { booking: rawBooking, payment } = envelope.data;
  const requestHash = await hashRequest(rawBooking);

  const existing = await repo.findBookingByIdempotencyKey(request.idempotencyKey);
  if (existing) return replayOf(existing, requestHash);

  const priced = await buildQuote(repo, rawBooking, now);
  if (priced.kind === 'invalid') {
    return fail(422, 'INVALID_BOOKING', 'Some booking details need fixing before we can continue.', priced.errors);
  }
  if (priced.kind === 'out-of-stock') {
    return fail(409, 'SOLD_OUT', priced.errors.map((e) => e.message).join(' '), priced.errors);
  }
  const { booking, quote } = priced;

  // No payment is needed (or looked at) for a $0 booking.
  if (quote.totalCents > 0) {
    if (payment === undefined) return fail(422, 'PAYMENT_INVALID', MISSING_MESSAGE);
    const paid = simulatePayment(payment.cardNumber);
    if (paid.status === 'declined') return fail(402, 'PAYMENT_DECLINED', paid.message);
    if (paid.status === 'invalid') return fail(422, 'PAYMENT_INVALID', paid.message);
  }

  const record: Omit<BookingRecord, 'createdAt'> = {
    id: crypto.randomUUID(),
    reference: newReference(),
    idempotencyKey: request.idempotencyKey,
    requestHash,
    booker: booking.booker,
    attendees: booking.attendees,
    quote,
    amountCents: quote.totalCents,
    status: 'confirmed',
  };
  const committed = await repo.commitBooking(record);

  switch (committed.kind) {
    case 'created':
      return { ok: true, replay: false, result: toResult({ ...record, createdAt: now.toISOString() }) };
    case 'duplicate-key': {
      // A concurrent double-submit won the race. Return its booking rather than an error.
      const winner = await repo.findBookingByIdempotencyKey(request.idempotencyKey);
      return winner ? replayOf(winner, requestHash) : fail(409, 'CONFLICT', 'Please try again.');
    }
    case 'promo-conflict':
      return fail(409, 'PROMO_EXHAUSTED', 'That promo code was just fully claimed. Please review your total and try again.');
    case 'stock-conflict': {
      // Someone else took the stock between our check and the commit. Name what ran out.
      const errors = stockErrors(quote, await repo.getInventory());
      const message = errors.length > 0 ? errors.map((e) => e.message).join(' ') : 'Some tickets just sold out. Please review your booking and try again.';
      return fail(409, 'SOLD_OUT', message, errors.length > 0 ? errors : undefined);
    }
  }
}
