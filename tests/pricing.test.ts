import { describe, it, expect } from 'vite-plus/test';
import { percentDiscountCents, priceBooking } from '../src/domain/pricing';
import { PROMO_SEED, evaluatePromo } from '../src/domain/promo';
import type { FestivalDay, GarbaDay, ItemId } from '../src/domain/catalog';
import type { Attendee, BookingRequest, EntryTicket, PromoResult, Quote, ValidBooking } from '../src/domain/types';

// Test-only: production code gets a ValidBooking from validateBooking(), never a cast.
const asValid = (b: BookingRequest): ValidBooking => b as ValidBooking;

const NOW = new Date('2026-11-24T12:00:00Z');
const NONE: PromoResult = { status: 'none' };
const promo = (code: string): PromoResult =>
  evaluatePromo(code, NOW, PROMO_SEED.find((p) => p.code === code));

const D10: FestivalDay = '2026-11-10';
const D11: FestivalDay = '2026-11-11';
const D12: FestivalDay = '2026-11-12';
const D13: FestivalDay = '2026-11-13';
const D14: FestivalDay = '2026-11-14';
const ALL_DAYS: readonly FestivalDay[] = [D10, D11, D12, D13, D14];

interface AttOpts {
  ticket?: EntryTicket;
  dinnerDays?: readonly FestivalDay[];
  garbaDays?: readonly GarbaDay[];
}
const att = (id: string, age: number, o: AttOpts = {}): Attendee => ({
  id,
  name: id,
  age,
  ticket: o.ticket ?? { kind: 'none' },
  dinnerDays: o.dinnerDays ?? [],
  garbaDays: o.garbaDays ?? [],
});
const day = (...days: FestivalDay[]): EntryTicket => ({ kind: 'day', days });

const booking = (attendees: Attendee[], extra: Partial<BookingRequest> = {}): ValidBooking =>
  asValid({
    booker: { name: 'Booker', email: 'b@example.com', phone: '5551234567', age: 40, attending: false },
    attendees,
    familyPasses: [],
    dandiyaQty: 0,
    ...extra,
  });

// Live stock as seeded: only the All-Day Adult Pass is sold out.
const SEEDED_SOLD_OUT: ReadonlySet<ItemId> = new Set<ItemId>(['allday-adult']);
const price = (b: ValidBooking, p: PromoResult = NONE, soldOut: ReadonlySet<ItemId> = SEEDED_SOLD_OUT): Quote =>
  priceBooking(b, p, soldOut);

describe('entry ticket lines', () => {
  it('prices an adult day pass per person-day', () => {
    const q = price(booking([att('a', 30, { ticket: day(D10, D11) })]));
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]).toMatchObject({ itemId: 'day-adult', attendeeId: 'a', qty: 2, unitCents: 1500, totalCents: 3000 });
    expect(q.subtotalCents).toBe(3000);
  });

  it('picks day-child for ages 5-11 and day-adult from 12', () => {
    const q = price(
      booking([
        att('c5', 5, { ticket: day(D10) }),
        att('c11', 11, { ticket: day(D10) }),
        att('a12', 12, { ticket: day(D10) }),
      ]),
    );
    expect(q.lines.map((l) => l.itemId)).toEqual(['day-child', 'day-child', 'day-adult']);
    expect(q.subtotalCents).toBe(800 + 800 + 1500);
  });

  it('prices all-day passes once per person', () => {
    const q = price(booking([att('c', 8, { ticket: { kind: 'allDay' } })]));
    expect(q.lines[0]).toMatchObject({ itemId: 'allday-child', qty: 1, totalCents: 3000 });
  });

  it('prices a family pass as one line per pass with the chosen day', () => {
    const q = price(
      booking(
        [
          att('a', 35, { ticket: { kind: 'family', passId: 'p1' } }),
          att('k', 8, { ticket: { kind: 'family', passId: 'p1' } }),
        ],
        { familyPasses: [{ id: 'p1', day: D12 }] },
      ),
    );
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]).toMatchObject({ itemId: 'family', day: D12, qty: 1, totalCents: 4000 });
    expect(q.lines[0]?.attendeeId).toBeUndefined();
    expect(q.subtotalCents).toBe(4000);
  });

  it('charges toddlers nothing for entry', () => {
    const q = price(booking([att('t', 3), att('a', 30, { ticket: day(D10) })]));
    expect(q.subtotalCents).toBe(1500);
    expect(q.lines.every((l) => l.totalCents > 0)).toBe(true);
  });

  it('toddlers can still buy a dinner plate', () => {
    const q = price(booking([att('t', 3, { dinnerDays: [D10] })]));
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]).toMatchObject({ itemId: 'dinner', attendeeId: 't', qty: 1, totalCents: 1200 });
  });
});

describe('extras', () => {
  it('prices dinner per plate (one per dinner day)', () => {
    const q = price(booking([att('a', 30, { ticket: day(D10, D11, D12), dinnerDays: [D10, D12] })]));
    const dinner = q.lines.find((l) => l.itemId === 'dinner');
    expect(dinner).toMatchObject({ qty: 2, unitCents: 1200, totalCents: 2400 });
  });

  it('prices garba per session', () => {
    const q = price(booking([att('a', 30, { ticket: day(D11, D13), garbaDays: [D11, D13] })]));
    const garba = q.lines.find((l) => l.itemId === 'garba');
    expect(garba).toMatchObject({ qty: 2, unitCents: 2000, totalCents: 4000 });
  });

  it('adds one dandiya line for the whole booking', () => {
    const q = price(booking([att('a', 30, { ticket: day(D10) })], { dandiyaQty: 3 }));
    const dandiya = q.lines.filter((l) => l.itemId === 'dandiya');
    expect(dandiya).toHaveLength(1);
    expect(dandiya[0]).toMatchObject({ qty: 3, unitCents: 500, totalCents: 1500 });
    expect(dandiya[0]?.attendeeId).toBeUndefined();
  });

  it('adds no dandiya line when quantity is 0', () => {
    const q = price(booking([att('a', 30, { ticket: day(D10) })]));
    expect(q.lines.some((l) => l.itemId === 'dandiya')).toBe(false);
  });
});

describe('stockNeeded', () => {
  it('counts person-days, persons, passes, plates, sessions and sticks', () => {
    const q = price(
      booking(
        [
          att('a1', 30, { ticket: day(D10, D11, D12), dinnerDays: [D10, D11], garbaDays: [D11] }),
          att('c1', 8, { ticket: day(D10) }),
          att('c2', 9, { ticket: { kind: 'allDay' }, dinnerDays: [D14] }),
          att('f1', 40, { ticket: { kind: 'family', passId: 'p1' }, garbaDays: [D13] }),
          att('f2', 38, { ticket: { kind: 'family', passId: 'p1' } }),
        ],
        { familyPasses: [{ id: 'p1', day: D13 }], dandiyaQty: 4 },
      ),
    );
    expect(q.stockNeeded).toEqual({
      'day-adult': 3,
      'day-child': 1,
      'allday-child': 1,
      family: 1,
      dinner: 3,
      garba: 2,
      dandiya: 4,
    });
  });

  it('is empty for a toddler-only booking', () => {
    expect(price(booking([att('t', 2)])).stockNeeded).toEqual({});
  });
});

describe('percentDiscountCents (half-up, integer math)', () => {
  it('rounds 146.5 up to 147', () => expect(percentDiscountCents(1465, 10)).toBe(147));
  it('rounds 144.5 up to 145', () => expect(percentDiscountCents(1445, 10)).toBe(145));
  it('rounds 144.4 down to 144', () => expect(percentDiscountCents(1444, 10)).toBe(144));
  it('is exact when no rounding is needed', () => expect(percentDiscountCents(2000, 10)).toBe(200));
  it('does not drift like floating point (14.65 * 0.1)', () => expect(percentDiscountCents(1465, 10)).toBe(147));
});

describe('SEVA10', () => {
  it('takes 10% off the subtotal including extras', () => {
    const q = price(booking([att('a', 30, { ticket: day(D10), dinnerDays: [D10] })], { dandiyaQty: 1 }), promo('SEVA10'));
    expect(q.subtotalCents).toBe(1500 + 1200 + 500);
    expect(q.discountCents).toBe(320);
    expect(q.totalCents).toBe(2880);
    expect(q.promo.status).toBe('applied');
  });
});

describe('FLAT20', () => {
  it('takes $20 off a larger booking', () => {
    const q = price(booking([att('a', 30, { ticket: day(D10, D11, D12) })]), promo('FLAT20'));
    expect(q.discountCents).toBe(2000);
    expect(q.totalCents).toBe(4500 - 2000);
  });

  it('floors the total at $0 on a $15 booking', () => {
    const q = price(booking([att('a', 30, { ticket: day(D10) })]), promo('FLAT20'));
    expect(q.subtotalCents).toBe(1500);
    expect(q.discountCents).toBe(1500);
    expect(q.totalCents).toBe(0);
  });
});

describe('KIDSFREE', () => {
  it('zeroes child day and all-day lines only in a mixed group', () => {
    const q = price(
      booking(
        [
          att('a', 35, { ticket: day(D10), dinnerDays: [D10] }),
          att('c1', 8, { ticket: day(D10, D11), dinnerDays: [D10] }),
          att('c2', 10, { ticket: { kind: 'allDay' } }),
        ],
        { dandiyaQty: 2 },
      ),
      promo('KIDSFREE'),
    );
    expect(q.discountCents).toBe(1600 + 3000);
    expect(q.totalCents).toBe(q.subtotalCents - 4600);
    expect(q.promo.status).toBe('applied');
  });

  it('can bring a kids-only booking to $0 (D11)', () => {
    const q = price(booking([att('a', 30), att('c', 8, { ticket: day(D10) })]), promo('KIDSFREE'));
    expect(q.totalCents).toBe(0);
  });

  it('does not discount family passes or extras', () => {
    const q = price(
      booking(
        [att('a', 35, { ticket: { kind: 'family', passId: 'p1' } }), att('c', 8, { ticket: { kind: 'family', passId: 'p1' }, dinnerDays: [D10] })],
        { familyPasses: [{ id: 'p1', day: D10 }], dandiyaQty: 1 },
      ),
      promo('KIDSFREE'),
    );
    expect(q.discountCents).toBe(0);
    expect(q.totalCents).toBe(q.subtotalCents);
  });

  it('becomes not-applicable with a friendly message when there are no child entry tickets', () => {
    const q = price(
      booking([att('a', 35, { ticket: { kind: 'family', passId: 'p1' } })], { familyPasses: [{ id: 'p1', day: D10 }] }),
      promo('KIDSFREE'),
    );
    expect(q.promo).toMatchObject({ status: 'not-applicable', code: 'KIDSFREE' });
    expect(q.promo.status === 'not-applicable' && q.promo.message).toMatch(/without a discount/);
    expect(q.discountCents).toBe(0);
  });
});

describe('failed promos', () => {
  it.each(['EXPIRED5', 'MAXEDOUT', 'NOPE'])('%s gives no discount and is passed through', (code) => {
    const p = promo(code);
    const q = price(booking([att('a', 30, { ticket: day(D10) })]), p);
    expect(q.discountCents).toBe(0);
    expect(q.totalCents).toBe(q.subtotalCents);
    expect(q.promo).toEqual(p);
  });
});

describe('hints', () => {
  it('suggests the All-Day Child Pass over 5 child Day Passes', () => {
    const q = price(booking([att('kid', 8, { ticket: day(...ALL_DAYS) })]));
    expect(q.hints.some((h) => h.includes('All-Day Child Pass ($30) is cheaper than 5 Day Passes ($40)'))).toBe(true);
  });

  it('does not recommend an All-Day Child Pass that is sold out', () => {
    const q = price(booking([att('kid', 8, { ticket: day(...ALL_DAYS) })]), NONE, new Set<ItemId>(['allday-child']));
    expect(q.hints.join(' ')).not.toContain('is cheaper');
  });

  it('recommends the All-Day Adult Pass once it is no longer sold out', () => {
    const q = price(booking([att('adult', 30, { ticket: day(...ALL_DAYS) })]), NONE, new Set<ItemId>());
    expect(q.hints.join(' ')).toContain('an All-Day Adult Pass ($60) is cheaper than 5 Day Passes ($75)');
    expect(q.hints.join(' ')).not.toContain('sold out');
  });

  it('names days in words in the Family Pass hints, never as ISO dates', () => {
    const family = price(
      booking(
        [att('a', 35, { ticket: { kind: 'family', passId: 'p1' } }), att('k', 8, { ticket: { kind: 'family', passId: 'p1' } })],
        { familyPasses: [{ id: 'p1', day: D11 }] },
      ),
    );
    expect(family.hints.join(' ')).toContain('on Wed 11 Nov,');
    const group = price(
      booking([
        att('a1', 35, { ticket: day(D10) }),
        att('a2', 34, { ticket: day(D10) }),
        att('k1', 8, { ticket: day(D10) }),
        att('k2', 6, { ticket: day(D10) }),
      ]),
    );
    expect(group.hints.join(' ')).toContain('On Tue 10 Nov,');
  });

  it('does not nag when day passes are not more expensive', () => {
    const q = price(booking([att('kid', 8, { ticket: day(D10, D11) })]));
    expect(q.hints).toEqual([]);
  });

  it('tells an adult on 5 Day Passes that All-Day Adult is sold out', () => {
    const q = price(booking([att('adult', 30, { ticket: day(...ALL_DAYS) })]));
    expect(q.hints).toHaveLength(1);
    expect(q.hints[0]).toMatch(/sold out/i);
    expect(q.hints[0]).toContain('$75');
  });

  it('warns when a Family Pass costs more than individual day passes (1 adult + 1 child = $23)', () => {
    const q = price(
      booking(
        [att('a', 35, { ticket: { kind: 'family', passId: 'p1' } }), att('k', 8, { ticket: { kind: 'family', passId: 'p1' } })],
        { familyPasses: [{ id: 'p1', day: D10 }] },
      ),
    );
    expect(q.hints.some((h) => h.includes('$23') && h.includes('$40'))).toBe(true);
  });

  it('stays quiet when a Family Pass is the better deal', () => {
    const q = price(
      booking(
        [
          att('a1', 35, { ticket: { kind: 'family', passId: 'p1' } }),
          att('a2', 34, { ticket: { kind: 'family', passId: 'p1' } }),
          att('k1', 8, { ticket: { kind: 'family', passId: 'p1' } }),
          att('k2', 6, { ticket: { kind: 'family', passId: 'p1' } }),
        ],
        { familyPasses: [{ id: 'p1', day: D10 }] },
      ),
    );
    expect(q.hints).toEqual([]);
  });

  it('suggests a Family Pass for 2+ adults and 2+ children on single-day Day Passes', () => {
    const q = price(
      booking([
        att('a1', 35, { ticket: day(D10) }),
        att('a2', 34, { ticket: day(D10) }),
        att('k1', 8, { ticket: day(D10) }),
        att('k2', 6, { ticket: day(D10) }),
      ]),
    );
    expect(q.hints.some((h) => h.includes('Family Pass'))).toBe(true);
  });

  it('does not suggest a Family Pass when the group is on different days', () => {
    const q = price(
      booking([
        att('a1', 35, { ticket: day(D10) }),
        att('a2', 34, { ticket: day(D11) }),
        att('k1', 8, { ticket: day(D10) }),
        att('k2', 6, { ticket: day(D11) }),
      ]),
    );
    expect(q.hints).toEqual([]);
  });
});

describe('integer cents', () => {
  const allIntegers = (q: Quote): boolean => {
    const nums = [
      q.subtotalCents,
      q.discountCents,
      q.totalCents,
      ...q.lines.flatMap((l) => [l.qty, l.unitCents, l.totalCents]),
      ...Object.values(q.stockNeeded),
    ];
    return nums.every((n) => Number.isInteger(n));
  };

  const busy = booking(
    [
      att('a1', 35, { ticket: day(D10, D11, D13), dinnerDays: [D10, D13], garbaDays: [D11, D13] }),
      att('c1', 8, { ticket: day(D10, D11) }),
      att('c2', 11, { ticket: { kind: 'allDay' }, dinnerDays: [D12] }),
      att('t1', 3, { dinnerDays: [D10] }),
    ],
    { dandiyaQty: 7 },
  );

  it.each(['SEVA10', 'FLAT20', 'KIDSFREE', 'EXPIRED5', 'MAXEDOUT'])('every number is an integer under %s', (code) => {
    expect(allIntegers(price(busy, promo(code)))).toBe(true);
  });

  it('regression: line totals sum exactly to the subtotal (no 146.70000000000002)', () => {
    const q = price(busy, promo('SEVA10'));
    expect(q.lines.reduce((s, l) => s + l.totalCents, 0)).toBe(q.subtotalCents);
    expect(q.totalCents).toBe(q.subtotalCents - q.discountCents);
    expect(String(q.totalCents)).not.toMatch(/\./);
  });

  it('never goes negative', () => {
    const q = price(booking([att('a', 30, { ticket: day(D10) })]), promo('FLAT20'));
    expect(q.totalCents).toBeGreaterThanOrEqual(0);
  });
});
