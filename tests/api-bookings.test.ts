import { describe, expect, it } from 'vite-plus/test';
import { createBooking, type BookingOutcome } from '../src/server/booking';
import { buildQuote } from '../src/server/quote';
import { catalogView } from '../src/server/catalog';
import { toConfirmation } from '../src/server/confirmation';
import type { Repo } from '../src/server/repo';
import { APPROVED, booking, D10, DECLINED, garbaGroup, NOW, person } from './helpers/fixtures';
import { memoryRepo } from './helpers/memory-repo';

const KEY = 'key-0001-abcdef';
const book = (repo: Repo, b: unknown, payment: unknown = APPROVED, key = KEY): Promise<BookingOutcome> =>
  createBooking(repo, { idempotencyKey: key, body: { booking: b, payment } }, NOW);

function failure(outcome: BookingOutcome) {
  if (outcome.ok) throw new Error('expected a failure');
  return outcome;
}
function success(outcome: BookingOutcome) {
  if (!outcome.ok) throw new Error(`expected success, got ${outcome.error.code}`);
  return outcome;
}

describe('POST /api/bookings: happy path', () => {
  it('creates a booking, prices it on the server and takes the stock', async () => {
    const repo = memoryRepo();
    const out = success(await book(repo, booking()));
    expect(out.replay).toBe(false);
    expect(out.result.amountCents).toBe(1500);
    expect(out.result.reference).toMatch(/^SU26-[A-HJKMNP-Z2-9]{6}$/);
    expect(repo.inventory['day-adult']).toBe(379);
    expect(repo.bookings.size).toBe(1);
  });

  it('applies and counts a promo code', async () => {
    const repo = memoryRepo();
    const out = success(await book(repo, booking({ promoCode: ' seva10 ' })));
    expect(out.result.amountCents).toBe(1350);
    expect(repo.promos.get('SEVA10')?.uses).toBe(1);
  });

  it('needs no card for a $0 booking, and ignores one if sent', async () => {
    const repo = memoryRepo();
    const out = success(await createBooking(repo, { idempotencyKey: KEY, body: { booking: booking({ promoCode: 'FLAT20' }) } }, NOW));
    expect(out.result.amountCents).toBe(0);
    expect(repo.bookings.size).toBe(1);
  });
});

describe('idempotency', () => {
  it('replays the same booking for the same key without taking stock twice', async () => {
    const repo = memoryRepo();
    const first = success(await book(repo, booking()));
    const again = success(await book(repo, booking()));
    expect(again.replay).toBe(true);
    expect(again.result).toEqual(first.result);
    expect(repo.inventory['day-adult']).toBe(379);
    expect(repo.bookings.size).toBe(1);
  });

  it('rejects the same key with a different booking', async () => {
    const repo = memoryRepo();
    success(await book(repo, booking()));
    const other = failure(await book(repo, booking({ dandiyaQty: 1 })));
    expect(other.status).toBe(422);
    expect(other.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(repo.bookings.size).toBe(1);
  });

  it('treats key order in the JSON as irrelevant', async () => {
    const repo = memoryRepo();
    const b = booking();
    success(await book(repo, b));
    const reordered = { dandiyaQty: 0, familyPasses: [], attendees: b.attendees, booker: b.booker };
    expect(success(await book(repo, reordered)).replay).toBe(true);
  });

  it('returns the winner when a concurrent double-submit loses the race at commit', async () => {
    const repo = memoryRepo();
    const first = success(await book(repo, booking()));
    let calls = 0;
    // The pre-check misses (the other request has not committed yet); the commit then hits the unique key.
    const racing: Repo = { ...repo, findBookingByIdempotencyKey: async (k) => (calls++ === 0 ? undefined : repo.findBookingByIdempotencyKey(k)) };
    const out = success(await book(racing, booking()));
    expect(out.replay).toBe(true);
    expect(out.result.bookingId).toBe(first.result.bookingId);
    expect(repo.inventory['day-adult']).toBe(379);
  });
});

describe('never trusting the client', () => {
  it('rejects a booking that carries a price', async () => {
    const repo = memoryRepo();
    const tampered = { ...booking(), priceCents: 1 };
    const out = failure(await book(repo, tampered));
    expect(out.status).toBe(422);
    expect(out.error.code).toBe('INVALID_BOOKING');
    expect(out.error.fields?.some((f) => f.code === 'unexpected_field' && f.path === 'priceCents')).toBe(true);
    expect(repo.bookings.size).toBe(0);
  });

  it('rejects a total smuggled next to the booking', async () => {
    const out = failure(await createBooking(memoryRepo(), { idempotencyKey: KEY, body: { booking: booking(), totalCents: 1, payment: APPROVED } }, NOW));
    expect(out.status).toBe(400);
    expect(out.error.code).toBe('INVALID_REQUEST');
  });

  it('prices a 7-year-old as a child even though the client meant an adult ticket', async () => {
    const repo = memoryRepo();
    const b = booking({
      attendees: [person('a1', 'Meera Shah', 38, { kind: 'day', days: [D10] }), person('a2', 'Anaya', 7, { kind: 'day', days: [D10] })],
    });
    const out = success(await book(repo, b));
    expect(out.result.amountCents).toBe(1500 + 800);
    expect(out.result.quote.stockNeeded).toEqual({ 'day-adult': 1, 'day-child': 1 });
  });

  it('returns field-level rule errors for a bad booking', async () => {
    const out = failure(await book(memoryRepo(), booking({ booker: { name: 'Teen', email: 'a@b.co', phone: '214-555-0101', age: 17, attending: false } })));
    expect(out.status).toBe(422);
    expect(out.error.fields?.map((f) => f.code)).toContain('booker_too_young');
  });
});

describe('stock', () => {
  it('409s when the All-Day Adult Pass is sold out and changes nothing', async () => {
    const repo = memoryRepo();
    const b = booking({ attendees: [person('a1', 'Meera Shah', 38, { kind: 'allDay' })] });
    const out = failure(await book(repo, b));
    expect(out.status).toBe(409);
    expect(out.error.code).toBe('SOLD_OUT');
    expect(out.error.fields?.[0]).toMatchObject({ code: 'SOLD_OUT', path: 'stock.allday-adult' });
    expect(repo.bookings.size).toBe(0);
  });

  it('409s with a helpful message when 3 workshop places are asked for and 2 are left', async () => {
    const repo = memoryRepo();
    const out = failure(await book(repo, garbaGroup(3)));
    expect(out.status).toBe(409);
    expect(out.error.message).toBe('Only 2 Garba Workshop places are left.');
    expect(out.error.fields?.[0]?.code).toBe('INSUFFICIENT_STOCK');
    expect(repo.inventory['garba']).toBe(2);
    expect(repo.inventory['day-adult']).toBe(380);
  });

  it('sells the last 2 places once: the next booking is sold out', async () => {
    const repo = memoryRepo();
    success(await book(repo, garbaGroup(2), APPROVED, 'key-first-0001'));
    expect(repo.inventory['garba']).toBe(0);
    const late = failure(await book(repo, garbaGroup(1), APPROVED, 'key-second-0002'));
    expect(late.status).toBe(409);
    expect(late.error.message).toBe('Garba Workshop is sold out.');
  });

  it('409s and names the item when stock vanishes between the check and the commit', async () => {
    const repo = memoryRepo();
    const stale = await repo.getInventory();
    success(await book(repo, garbaGroup(2), APPROVED, 'key-first-0001'));
    let reads = 0; // the pre-check sees stale stock; the re-read after the failed commit sees the truth
    const lagging: Repo = { ...repo, getInventory: async () => (reads++ === 0 ? stale : repo.getInventory()) };
    const out = failure(await book(lagging, garbaGroup(1), APPROVED, 'key-second-0002'));
    expect(out.status).toBe(409);
    expect(out.error.code).toBe('SOLD_OUT');
    expect(out.error.message).toBe('Garba Workshop is sold out.');
  });

  it('409s PROMO_EXHAUSTED when the last use is taken between the check and the commit', async () => {
    const repo = memoryRepo();
    const seva = repo.promos.get('SEVA10');
    if (!seva) throw new Error('SEVA10 missing from seed');
    repo.promos.set('SEVA10', { ...seva, maxUses: 1 });
    success(await book(repo, booking({ promoCode: 'SEVA10' }), APPROVED, 'key-first-0001'));
    const stalePromo = { code: 'SEVA10' as const, kind: 'percent' as const, value: 10, expiresAt: null, maxUses: 1, uses: 0 };
    const lagging: Repo = { ...repo, getPromo: async () => stalePromo };
    const out = failure(await book(lagging, booking({ promoCode: 'SEVA10' }), APPROVED, 'key-second-0002'));
    expect(out.status).toBe(409);
    expect(out.error.code).toBe('PROMO_EXHAUSTED');
    expect(repo.bookings.size).toBe(1);
  });
});

describe('payment', () => {
  it('402s a declined card and leaves stock and bookings untouched', async () => {
    const repo = memoryRepo();
    const out = failure(await book(repo, booking(), DECLINED));
    expect(out.status).toBe(402);
    expect(out.error.code).toBe('PAYMENT_DECLINED');
    expect(out.error.message).toBe('Your card was declined. No money was taken and nothing was booked.');
    expect(repo.inventory['day-adult']).toBe(380);
    expect(repo.bookings.size).toBe(0);
  });

  it('422s an unknown card number', async () => {
    const out = failure(await book(memoryRepo(), booking(), { cardNumber: '1234 5678 9012 3456' }));
    expect(out.status).toBe(422);
    expect(out.error.code).toBe('PAYMENT_INVALID');
  });

  it('422s a paid booking with no payment', async () => {
    const out = failure(await createBooking(memoryRepo(), { idempotencyKey: KEY, body: { booking: booking() } }, NOW));
    expect(out.status).toBe(422);
    expect(out.error.code).toBe('PAYMENT_INVALID');
  });

  it('never echoes the card number back or stores it', async () => {
    const repo = memoryRepo();
    const out = success(await book(repo, booking()));
    const everything = JSON.stringify([out, [...repo.bookings.values()]]);
    expect(everything).not.toContain('4242');
  });
});

describe('quote and catalog', () => {
  it('quotes with a promo problem inside the quote, not as an error', async () => {
    const out = await buildQuote(memoryRepo(), booking({ promoCode: 'EXPIRED5' }), NOW);
    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') expect(out.quote.promo.status).toBe('expired');
  });

  it('reports stock problems as rule errors on a quote', async () => {
    const out = await buildQuote(memoryRepo(), garbaGroup(3), NOW);
    expect(out.kind).toBe('out-of-stock');
  });

  it('shows remaining stock from the repository', async () => {
    const repo = memoryRepo();
    success(await book(repo, garbaGroup(2)));
    const view = await catalogView(repo);
    const garba = view.items.find((i) => i.id === 'garba');
    const allDayAdult = view.items.find((i) => i.id === 'allday-adult');
    expect(garba).toMatchObject({ remaining: 0, soldOut: true });
    expect(allDayAdult).toMatchObject({ remaining: 0, soldOut: true });
    expect(view.items.find((i) => i.id === 'day-adult')).toMatchObject({ remaining: 378, soldOut: false });
    expect(view.days).toHaveLength(5);
  });
});

describe('confirmation view', () => {
  it('shows booker name and email only, plus a ticket summary per person', async () => {
    const repo = memoryRepo();
    const out = success(await book(repo, booking()));
    const record = await repo.getBooking(out.result.bookingId);
    if (!record) throw new Error('missing booking');
    const view = toConfirmation(record);
    expect(view.booker).toEqual({ name: 'Meera Shah', email: 'meera@example.com' });
    expect(view.attendees).toEqual([{ name: 'Meera Shah', ticket: 'Day Pass: Tue 10 Nov' }]);
    expect(JSON.stringify(view)).not.toContain('214-555');
  });
});
