// Gap tests for TEST-CASES.md: only situations the other test files do not already pin down.
// Everything runs through the real server pipeline over the in-memory repo (same all-or-nothing commit as D1).
import { describe, expect, it } from 'vite-plus/test';
import { advanceCheck, bookingReducer, initialState, type BookingAction } from '../src/booking/machine';
import { validateBooking } from '../src/domain/eligibility';
import type { Attendee, BookingRequest, EntryTicket, FamilyPass } from '../src/domain/types';
import { createBooking, type BookingOutcome } from '../src/server/booking';
import { catalogView } from '../src/server/catalog';
import { buildQuote } from '../src/server/quote';
import type { Repo } from '../src/server/repo';
import { APPROVED, booking, D10, D11, DECLINED, NOW, person } from './helpers/fixtures';
import { memoryRepo } from './helpers/memory-repo';

const D13 = '2026-11-13';
const ALL_DAYS = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'] as const;

let keyCounter = 0;
const nextKey = (): string => `edge-key-${String(++keyCounter).padStart(6, '0')}`;

const book = (repo: Repo, body: unknown, payment: unknown = APPROVED, key: string = nextKey()): Promise<BookingOutcome> =>
  createBooking(repo, { idempotencyKey: key, body: { booking: body, payment } }, NOW);

function won(outcome: BookingOutcome) {
  if (!outcome.ok) throw new Error(`expected success, got ${outcome.error.code}: ${outcome.error.message}`);
  return outcome;
}
function lost(outcome: BookingOutcome) {
  if (outcome.ok) throw new Error('expected a failure');
  return outcome;
}

const day = (...days: Extract<EntryTicket, { kind: 'day' }>['days'][number][]): EntryTicket => ({ kind: 'day', days });
const onPass = (passId: string): EntryTicket => ({ kind: 'family', passId });
const NONE: EntryTicket = { kind: 'none' };
const meera = (ticket: EntryTicket = day(D10), extra: Partial<Attendee> = {}): Attendee => person('a1', 'Meera Shah', 38, ticket, extra);
const guests = (n: number, ticket: EntryTicket = day(D10)): Attendee[] =>
  Array.from({ length: n }, (_, i) => person(`g${i + 1}`, `Guest ${i + 1}`, 30, ticket));

/** Booker who is not in the group, so the tests choose every attendee. */
const asideBooker = (age = 40): BookingRequest['booker'] => ({
  name: 'Raj Shah',
  email: 'raj@example.com',
  phone: '214-555-0102',
  age,
  attending: false,
});

const codesOf = (input: unknown): string[] => {
  const r = validateBooking(input);
  return r.ok ? [] : r.error.map((e) => e.code);
};

// ---------------------------------------------------------------- ages and identity

describe('age boundaries: 4|5, 11|12, 17|18', () => {
  it.each<[number, EntryTicket, string | undefined]>([
    [4, NONE, undefined],
    [4, day(D10), 'toddler_free'],
    [5, NONE, 'ticket_required'],
    [5, day(D10), undefined],
    [11, day(D10), undefined],
    [12, NONE, 'ticket_required'],
    [12, day(D10), undefined],
  ])('a guest aged %i on %j gives %s', (age, ticket, expected) => {
    const b = booking({ attendees: [meera(), person('g1', 'Guest', age, ticket)] });
    expect(codesOf(b)).toEqual(expected === undefined ? [] : [expected]);
  });

  it.each([
    [4, 0],
    [5, 800],
    [11, 800],
    [12, 1500],
    [17, 1500],
    [18, 1500],
  ])('a guest aged %i on a Day Pass adds %i cents on top of the booker', async (age, cents) => {
    const ticket = age < 5 ? NONE : day(D10);
    const out = won(await book(memoryRepo(), booking({ attendees: [meera(), person('g1', 'Guest', age, ticket)] })));
    expect(out.result.amountCents).toBe(1500 + cents);
  });

  it.each([
    [17, false],
    [18, true],
  ])('a booker aged %i is accepted: %s', (age, accepted) => {
    const b = booking({
      booker: { name: 'Meera Shah', email: 'meera@example.com', phone: '214-555-0101', age, attending: true },
      attendees: [person('a1', 'Meera Shah', age, day(D10))],
    });
    expect(codesOf(b)).toEqual(accepted ? [] : ['booker_too_young']);
  });

  it('needs an attendee aged 18+: a 17-year-old does not supervise an 11-year-old, an 18-year-old does', () => {
    const group = (supervisorAge: number) =>
      booking({
        booker: asideBooker(),
        attendees: [person('a1', 'Kid', 11, day(D10)), person('a2', 'Sibling', supervisorAge, day(D10))],
      });
    expect(codesOf(group(17))).toEqual(['needs_adult_supervisor']);
    expect(codesOf(group(18))).toEqual([]);
  });
});

describe('names and duplicates', () => {
  it('rejects a name that is only spaces, accepts 80 characters, rejects 81', () => {
    const named = (name: string) => booking({ booker: { ...booking().booker, name }, attendees: [meera(day(D10))].map((a) => ({ ...a, name })) });
    expect(codesOf(named('   '))).not.toEqual([]);
    expect(codesOf(named('A'.repeat(80)))).toEqual([]);
    expect(codesOf(named('A'.repeat(81)))).not.toEqual([]);
  });

  it('lets twins with the same name and age book together (ids tell them apart, names do not)', () => {
    const twins = [person('t1', 'Anaya Shah', 9, day(D10)), person('t2', 'Anaya Shah', 9, day(D10))];
    expect(codesOf(booking({ attendees: [meera(), ...twins] }))).toEqual([]);
  });
});

// ---------------------------------------------------------------- group size

describe('group and quantity limits', () => {
  it('accepts exactly 20 people ($300) and takes 20 Day Pass days from stock', async () => {
    const repo = memoryRepo();
    const out = won(await book(repo, booking({ attendees: [meera(), ...guests(19)] })));
    expect(out.result.amountCents).toBe(20 * 1500);
    expect(repo.inventory['day-adult']).toBe(360);
  });

  it('rejects the 21st person with a 422 and takes nothing', async () => {
    const repo = memoryRepo();
    const out = lost(await book(repo, booking({ attendees: [meera(), ...guests(20)] })));
    expect(out.status).toBe(422);
    expect(out.error.fields?.map((f) => f.path)).toEqual(['attendees']);
    expect(repo.inventory['day-adult']).toBe(380);
    expect(repo.bookings.size).toBe(0);
  });

  it('accepts 20 pairs of Dandiya Sticks ($100) and rejects 21', async () => {
    const repo = memoryRepo();
    expect(won(await book(repo, booking({ dandiyaQty: 20 }))).result.amountCents).toBe(1500 + 20 * 500);
    expect(repo.inventory['dandiya']).toBe(880);
    const over = lost(await book(repo, booking({ dandiyaQty: 21 })));
    expect(over.status).toBe(422);
    expect(over.error.fields?.map((f) => f.path)).toEqual(['dandiyaQty']);
    expect(repo.inventory['dandiya']).toBe(880);
  });
});

// ---------------------------------------------------------------- family pass, extras and days

describe('family pass pricing and stock', () => {
  /** n adults + m children on one pass. */
  const crew = (passId: string, adults: number, children: number): Attendee[] => [
    ...Array.from({ length: adults }, (_, i) => person(`${passId}-a${i}`, `Adult ${passId}-${i}`, 40, onPass(passId))),
    ...Array.from({ length: children }, (_, i) => person(`${passId}-c${i}`, `Child ${passId}-${i}`, 8, onPass(passId))),
  ];

  it('2 adults + 2 children + a toddler cost exactly $40, from Family Pass stock only', async () => {
    const repo = memoryRepo();
    const attendees = [
      person('a1', 'Meera Shah', 38, onPass('p1')),
      person('a2', 'Raj Shah', 40, onPass('p1')),
      person('a3', 'Anaya', 9, onPass('p1')),
      person('a4', 'Kabir', 6, onPass('p1')),
      person('a5', 'Tiny', 3, NONE),
    ];
    const out = won(await book(repo, booking({ attendees, familyPasses: [{ id: 'p1', day: D11 }] })));
    expect(out.result.amountCents).toBe(4000);
    expect(out.result.quote.lines.map((l) => l.itemId)).toEqual(['family']);
    expect(out.result.quote.stockNeeded).toEqual({ family: 1 });
    expect(repo.inventory['family']).toBe(94);
    expect(repo.inventory['day-adult']).toBe(380);
    expect(repo.inventory['day-child']).toBe(260);
  });

  it('two full passes on the same day cost $80 and take two Family Pass units', async () => {
    const repo = memoryRepo();
    const attendees = [meera(onPass('p1')), ...crew('p1', 1, 2), ...crew('p2', 2, 2)];
    const familyPasses: FamilyPass[] = [{ id: 'p1', day: D11 }, { id: 'p2', day: D11 }];
    const out = won(await book(repo, booking({ attendees, familyPasses })));
    expect(out.result.amountCents).toBe(8000);
    expect(repo.inventory['family']).toBe(93);
  });
});

describe('dinner, Garba and All-Day totals', () => {
  it('a toddler can have a dinner plate on a day the family is in: $15 + $12', async () => {
    const repo = memoryRepo();
    const attendees = [meera(day(D10)), person('t1', 'Tiny', 3, NONE, { dinnerDays: [D10] })];
    const out = won(await book(repo, booking({ attendees })));
    expect(out.result.amountCents).toBe(2700);
    expect(out.result.quote.stockNeeded).toEqual({ 'day-adult': 1, dinner: 1 });
  });

  it('an All-Day child with dinner on all 5 days and both workshops: $30 + $60 + $40, plus the adult $15', async () => {
    const repo = memoryRepo();
    const kid = person('c1', 'Anaya', 9, { kind: 'allDay' }, { dinnerDays: [...ALL_DAYS], garbaDays: [D11, D13] });
    const out = won(await book(repo, booking({ attendees: [meera(), kid] })));
    expect(out.result.amountCents).toBe(1500 + 3000 + 6000 + 4000);
    expect(out.result.quote.stockNeeded).toEqual({ 'day-adult': 1, 'allday-child': 1, dinner: 5, garba: 2 });
    expect(repo.inventory['garba']).toBe(0);
  });
});

// ---------------------------------------------------------------- promo codes end to end

describe('promo codes through the server', () => {
  it.each([
    [1, 0],
    [2, 500],
  ])('FLAT20 on a $15 pass + %i pair(s) of Dandiya Sticks leaves %i cents (never negative)', async (pairs, expected) => {
    const repo = memoryRepo();
    const out = won(await createBooking(repo, { idempotencyKey: nextKey(), body: { booking: booking({ dandiyaQty: pairs, promoCode: 'FLAT20' }), payment: APPROVED } }, NOW));
    expect(out.result.amountCents).toBe(expected);
    expect(out.result.quote.discountCents).toBe(Math.min(2000, 1500 + pairs * 500));
  });

  it('SEVA10 on a Family Pass with dinner, Garba and Dandiya takes exactly 10% of $99', async () => {
    const repo = memoryRepo();
    const attendees = [
      meera(onPass('p1'), { dinnerDays: [D11], garbaDays: [D11] }),
      person('a2', 'Raj Shah', 40, onPass('p1'), { dinnerDays: [D11] }),
    ];
    const out = won(await book(repo, booking({ attendees, familyPasses: [{ id: 'p1', day: D11 }], dandiyaQty: 3, promoCode: 'SEVA10' })));
    expect(out.result.quote.subtotalCents).toBe(4000 + 2400 + 2000 + 1500);
    expect(out.result.quote.discountCents).toBe(990);
    expect(out.result.amountCents).toBe(8910);
  });

  it('KIDSFREE zeroes an All-Day child pass but not the child dinner or the adult', async () => {
    const repo = memoryRepo();
    const kid = person('c1', 'Anaya', 9, { kind: 'allDay' }, { dinnerDays: [D10] });
    const out = won(await book(repo, booking({ attendees: [meera(), kid], promoCode: 'KIDSFREE' })));
    expect(out.result.quote.discountCents).toBe(3000);
    expect(out.result.amountCents).toBe(1500 + 1200);
    expect(repo.inventory['allday-child']).toBe(139);
    expect(repo.promos.get('KIDSFREE')?.uses).toBe(1);
  });

  it('KIDSFREE on an adults-only booking still books at full price and does not burn a use', async () => {
    const repo = memoryRepo();
    const out = won(await book(repo, booking({ promoCode: 'KIDSFREE' })));
    expect(out.result.amountCents).toBe(1500);
    expect(out.result.quote.promo.status).toBe('not-applicable');
    expect(repo.promos.get('KIDSFREE')?.uses).toBe(0);
  });

  it.each(['NOPE', 'EXPIRED5', 'MAXEDOUT'])('%s books at full price and leaves every promo counter alone', async (code) => {
    const repo = memoryRepo();
    const before = [...repo.promos.values()].map((p) => p.uses);
    const out = won(await book(repo, booking({ promoCode: code })));
    expect(out.result.amountCents).toBe(1500);
    expect(out.result.quote.discountCents).toBe(0);
    expect([...repo.promos.values()].map((p) => p.uses)).toEqual(before);
  });

  it('a blank promo field is the same as no code', async () => {
    const out = await buildQuote(memoryRepo(), booking({ promoCode: '   ' }), NOW);
    expect(out.kind === 'ok' && out.quote.promo.status).toBe('none');
  });

  it('a declined card does not use up a promo code', async () => {
    const repo = memoryRepo();
    lost(await book(repo, booking({ promoCode: 'SEVA10' }), DECLINED));
    expect(repo.promos.get('SEVA10')?.uses).toBe(0);
  });
});

// ---------------------------------------------------------------- stock and concurrency

describe('stock edges', () => {
  it('Garba with 1 place left and 2 asked for: 409, tells how many are left, takes nothing', async () => {
    const repo = memoryRepo();
    repo.inventory['garba'] = 1;
    const twoSeats = booking({
      attendees: [meera(day(D11), { garbaDays: [D11] }), person('a2', 'Raj Shah', 40, day(D11), { garbaDays: [D11] })],
    });
    const out = lost(await book(repo, twoSeats));
    expect(out.status).toBe(409);
    expect(out.error.message).toBe('Only 1 Garba Workshop place is left.');
    expect(repo.inventory['garba']).toBe(1);
    expect(repo.inventory['day-adult']).toBe(380);
  });

  it('Day Pass stock counts person-days: 3 days for one adult need 3, with 2 left it is a 409; 2 days fit', async () => {
    const repo = memoryRepo();
    repo.inventory['day-adult'] = 2;
    const threeDays = lost(await book(repo, booking({ attendees: [meera(day(D10, D11, D13))] })));
    expect(threeDays.status).toBe(409);
    expect(threeDays.error.fields?.[0]).toMatchObject({ code: 'INSUFFICIENT_STOCK', path: 'stock.day-adult' });
    expect(repo.inventory['day-adult']).toBe(2);
    won(await book(repo, booking({ attendees: [meera(day(D10, D11))] })));
    expect(repo.inventory['day-adult']).toBe(0);
  });

  it('with Day Pass stock at 0 an adult booking is SOLD_OUT, and the catalog says so', async () => {
    const repo = memoryRepo();
    repo.inventory['day-adult'] = 0;
    const out = lost(await book(repo, booking()));
    expect(out.error.code).toBe('SOLD_OUT');
    const item = (await catalogView(repo)).items.find((i) => i.id === 'day-adult');
    expect(item).toMatchObject({ remaining: 0, soldOut: true });
  });

  it('reports every item that is short in one answer, not one at a time', async () => {
    const repo = memoryRepo();
    repo.inventory['dandiya'] = 1;
    const out = lost(await book(repo, booking({ attendees: [meera({ kind: 'allDay' })], dandiyaQty: 2 })));
    expect(out.error.fields?.map((f) => f.path)).toEqual(['stock.allday-adult', 'stock.dandiya']);
  });
});

describe('simultaneous requests (in-memory repo has the same all-or-nothing commit as the D1 batch)', () => {
  it('three submits with the same key create one booking and all return it', async () => {
    const repo = memoryRepo();
    const key = nextKey();
    const outcomes = await Promise.all([1, 2, 3].map(() => book(repo, booking(), APPROVED, key)));
    const ids = new Set(outcomes.map((o) => won(o).result.bookingId));
    expect(ids.size).toBe(1);
    expect(outcomes.filter((o) => o.ok && !o.replay)).toHaveLength(1);
    expect(repo.bookings.size).toBe(1);
    expect(repo.inventory['day-adult']).toBe(379);
  });

  it('two people racing for the last 2 workshop places: exactly one wins, stock stops at 0', async () => {
    const repo = memoryRepo();
    const twoSeats = booking({
      attendees: [meera(day(D11), { garbaDays: [D11] }), person('a2', 'Raj Shah', 40, day(D11), { garbaDays: [D11] })],
    });
    const [a, b] = await Promise.all([book(repo, twoSeats), book(repo, twoSeats)]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(lost(a.ok ? b : a).status).toBe(409);
    expect(repo.inventory['garba']).toBe(0);
    expect(repo.bookings.size).toBe(1);
  });

  it('six people racing for 2 places, one each: two win, four get 409, nothing goes negative', async () => {
    const repo = memoryRepo();
    const oneSeat = booking({ attendees: [meera(day(D11), { garbaDays: [D11] })] });
    const outcomes = await Promise.all(Array.from({ length: 6 }, () => book(repo, oneSeat)));
    expect(outcomes.filter((o) => o.ok)).toHaveLength(2);
    expect(outcomes.filter((o) => !o.ok && o.status === 409)).toHaveLength(4);
    expect(repo.inventory['garba']).toBe(0);
    expect(repo.inventory['day-adult']).toBe(378);
  });
});

// ---------------------------------------------------------------- trust boundary

describe('values the browser must never be able to set', () => {
  it.each(['quote', 'totalCents', 'amountCents', 'discountCents', 'subtotalCents', 'lines'])(
    'a "%s" key inside the booking is refused as an unexpected field',
    async (key) => {
      const repo = memoryRepo();
      const out = lost(await book(repo, { ...booking(), [key]: key === 'quote' ? { totalCents: 1 } : 1 }));
      expect(out.status).toBe(422);
      expect(out.error.fields).toContainEqual(expect.objectContaining({ code: 'unexpected_field', path: key }));
      expect(repo.bookings.size).toBe(0);
    },
  );

  it('an amount sneaked into the payment object is refused, nothing is booked', async () => {
    const repo = memoryRepo();
    const out = lost(await book(repo, booking(), { ...APPROVED, amountCents: 1 }));
    expect(out.status).toBe(400);
    expect(out.error.code).toBe('INVALID_REQUEST');
    expect(repo.bookings.size).toBe(0);
  });

  it('a __proto__ key in the JSON is refused, not merged', async () => {
    const poisoned: unknown = JSON.parse(JSON.stringify(booking()).replace(/^\{/, '{"__proto__":{"priceCents":1},'));
    const out = lost(await book(memoryRepo(), poisoned));
    expect(out.status).toBe(422);
  });
});

// ---------------------------------------------------------------- UI states a phone can hit

describe('flow states: no network', () => {
  const typed: BookingAction[] = [
    { type: 'bookerEdited', field: 'name', value: 'Meera Shah' },
    { type: 'bookerEdited', field: 'email', value: 'meera@example.com' },
    { type: 'bookerEdited', field: 'phone', value: '214-555-0101' },
    { type: 'bookerEdited', field: 'age', value: '38' },
  ];

  it('when the first stock lookup fails the catalog is offline; a later failure keeps the stock already shown', () => {
    const offline = bookingReducer(initialState(), { type: 'catalogUnavailable', offline: true });
    expect(offline.catalog.status).toBe('offline');
    const ready = bookingReducer(offline, {
      type: 'catalogLoaded',
      catalog: { days: [], garbaDays: [], items: [] },
    });
    expect(bookingReducer(ready, { type: 'catalogUnavailable', offline: true }).catalog.status).toBe('ready');
  });

  it('a lost quote request blocks "Next" with a connection message instead of letting the person through unchecked', () => {
    const asked = typed.reduce(bookingReducer, initialState());
    const down = bookingReducer(asked, { type: 'quoteUnavailable', offline: true });
    expect(down.quoteStatus).toBe('offline');
    expect(advanceCheck(down).kind).toBe('blocked');
    const back = bookingReducer(down, { type: 'quoteRefreshRequested' });
    expect(back.quoteStatus).toBe('loading');
  });
});

// ---------------------------------------------------------------- found while testing (each was fixed; these pin the fixes)

describe('found while testing', () => {
  it('does not recommend an All-Day Child Pass that is sold out right now', async () => {
    const repo = memoryRepo();
    repo.inventory['allday-child'] = 0;
    const kid = person('c1', 'Anaya', 9, day(D10, D11, D13, '2026-11-12', '2026-11-14'));
    const out = await buildQuote(repo, booking({ attendees: [meera(), kid] }), NOW);
    expect(out.kind === 'ok' && out.quote.hints.join(' ')).not.toContain('All-Day Child Pass ($30) is cheaper');
  });

  it('stops saying All-Day Adult is sold out once it is restocked', async () => {
    const repo = memoryRepo();
    repo.inventory['allday-adult'] = 10;
    const out = await buildQuote(repo, booking({ attendees: [person('a1', 'Meera Shah', 38, day(D10, D11, D13, '2026-11-12', '2026-11-14'))] }), NOW);
    const hints = out.kind === 'ok' ? out.quote.hints.join(' ') : '';
    expect(hints).toContain('All-Day Adult Pass ($60) is cheaper');
    expect(hints).not.toContain('sold out');
  });

  it('says the Family Pass hint with a readable date, not 2026-11-11', async () => {
    const out = await buildQuote(
      memoryRepo(),
      booking({
        attendees: [meera(onPass('p1')), person('c1', 'Anaya', 9, onPass('p1'))],
        familyPasses: [{ id: 'p1', day: D11 }],
      }),
      NOW,
    );
    expect(out.kind === 'ok' && out.quote.hints.join(' ')).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it.each(['-------', '(((((((', '+1 (21) 55-5'])('rejects phone %j: fewer than 7 digits', (phone) => {
    const b = booking({ booker: { name: 'Meera Shah', email: 'meera@example.com', phone, age: 38, attending: true } });
    expect(codesOf(b)).not.toEqual([]);
  });
});
