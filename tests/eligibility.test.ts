import { describe, it, expect } from 'vite-plus/test';
import { ageBand, entryDays, validateBooking } from '../src/domain/eligibility';
import type { Attendee, BookingRequest, EntryTicket, FamilyPass, RuleError } from '../src/domain/types';

const D10 = '2026-11-10';
const D11 = '2026-11-11';
const D12 = '2026-11-12';

function person(id: string, name: string, age: number, ticket: EntryTicket, extra: Partial<Attendee> = {}): Attendee {
  return { id, name, age, ticket, dinnerDays: [], garbaDays: [], ...extra };
}

const pass = (id: string, day: FamilyPass['day'] = D11): FamilyPass => ({ id, day });
const onPass = (passId: string): EntryTicket => ({ kind: 'family', passId });
const day = (...days: Extract<EntryTicket, { kind: 'day' }>['days'][number][]): EntryTicket => ({ kind: 'day', days });

/** A valid booking the tests then break one rule at a time. */
function booking(overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    booker: { name: 'Meera Shah', email: 'meera@example.com', phone: '214-555-0101', age: 38, attending: true },
    attendees: [person('a1', 'Meera Shah', 38, day(D10))],
    familyPasses: [],
    dandiyaQty: 0,
    ...overrides,
  };
}

function errorsOf(input: unknown): readonly RuleError[] {
  const r = validateBooking(input);
  return r.ok ? [] : r.error;
}
const pathsOf = (input: unknown) => errorsOf(input).map((e) => e.path);

describe('ageBand', () => {
  it.each([
    [0, 'toddler'],
    [4, 'toddler'],
    [5, 'child'],
    [11, 'child'],
    [12, 'adult'],
    [120, 'adult'],
  ] as const)('age %i is %s', (age, band) => {
    expect(ageBand(age)).toBe(band);
  });
});

describe('validateBooking: happy paths', () => {
  it('accepts a full family booking (pass, toddler, dinner, Garba, dandiya)', () => {
    const r = validateBooking(
      booking({
        attendees: [
          person('a1', 'Meera Shah', 38, onPass('p1'), { dinnerDays: [D11], garbaDays: [D11] }),
          person('a2', 'Raj Shah', 40, onPass('p1'), { dinnerDays: [D11] }),
          person('a3', 'Anaya', 9, onPass('p1')),
          person('a4', 'Kabir', 6, onPass('p1')),
          person('a5', 'Tiny', 3, { kind: 'none' }, { dinnerDays: [D11] }),
        ],
        familyPasses: [pass('p1')],
        dandiyaQty: 2,
      }),
    );
    expect(r.ok).toBe(true);
  });

  it('accepts a toddler with no ticket next to a ticketed adult', () => {
    const r = validateBooking(
      booking({ attendees: [person('a1', 'Meera Shah', 38, day(D10)), person('a2', 'Tiny', 3, { kind: 'none' })] }),
    );
    expect(r.ok).toBe(true);
  });

  it('accepts a toddler riding on a family pass without counting toward 2+2', () => {
    const r = validateBooking(
      booking({
        attendees: [
          person('a1', 'Meera Shah', 38, onPass('p1')),
          person('a2', 'Raj', 40, onPass('p1')),
          person('a3', 'Ann', 8, onPass('p1')),
          person('a4', 'Bea', 9, onPass('p1')),
          person('a5', 'Tiny', 2, onPass('p1')),
          person('a6', 'Tinier', 1, onPass('p1')),
        ],
        familyPasses: [pass('p1')],
      }),
    );
    expect(r.ok).toBe(true);
  });

  it('does not check stock: an All-Day adult ticket passes rules (the server owns stock)', () => {
    const r = validateBooking(booking({ attendees: [person('a1', 'Meera Shah', 38, { kind: 'allDay' })] }));
    expect(r.ok).toBe(true);
  });

  it('matches the booker case-insensitively', () => {
    const r = validateBooking(booking({ attendees: [person('a1', '  meera SHAH ', 38, day(D10))] }));
    expect(r.ok).toBe(true);
  });
});

describe('validateBooking: age is declared, and band follows the declared age', () => {
  // The ticket carries no band. The server derives the band from the declared age, so
  // "adult ticket for a 7-year-old" is not expressible; the real attack is lying about age.
  // We price by declared age and volunteers check at the door. This test documents that.
  it('treats a 7-year-old as a child whatever ticket they pick, and accepts an honest 7', () => {
    expect(ageBand(7)).toBe('child');
    const r = validateBooking(
      booking({
        booker: { name: 'Meera Shah', email: 'm@example.com', phone: '214-555-0101', age: 38, attending: false },
        attendees: [person('a1', 'Raj', 40, day(D10)), person('a2', 'Kid', 7, day(D10))],
      }),
    );
    expect(r.ok).toBe(true);
  });

  it('rejects a client trying to attach a band or price to a ticket', () => {
    const input = booking();
    const tampered = {
      ...input,
      attendees: [{ ...input.attendees[0], ticket: { kind: 'day', days: [D10], band: 'adult' } }],
    };
    expect(pathsOf(tampered)).toEqual(['attendees.0.ticket.band']);
  });

  it('rejects bad ages through the schema with a friendly message', () => {
    for (const age of ['12abc', -1, 3.5, 999, null]) {
      const input = booking();
      const errors = errorsOf({ ...input, attendees: [{ ...input.attendees[0], age }] });
      expect(errors.map((e) => e.path)).toContain('attendees.0.age');
    }
  });
});

describe('validateBooking: booker (D7)', () => {
  it('rejects a 17-year-old booker', () => {
    const errors = errorsOf(
      booking({
        booker: { name: 'Teen', email: 't@example.com', phone: '214-555-0101', age: 17, attending: false },
        attendees: [person('a1', 'Raj', 40, day(D10))],
      }),
    );
    expect(errors.map((e) => e.path)).toEqual(['booker.age']);
    expect(errors[0]?.message).toMatch(/18/);
  });

  it('rejects an attending booker whose first attendee has a different name', () => {
    const errors = errorsOf(booking({ attendees: [person('a1', 'Someone Else', 38, day(D10))] }));
    expect(errors.map((e) => e.path)).toEqual(['attendees.0.name']);
  });

  it('rejects an attending booker whose first attendee has a different age', () => {
    const errors = errorsOf(booking({ attendees: [person('a1', 'Meera Shah', 30, day(D10))] }));
    expect(errors.map((e) => e.path)).toEqual(['attendees.0.age']);
  });

  it('does not require a match when the booker is not attending', () => {
    const r = validateBooking(
      booking({
        booker: { name: 'Meera Shah', email: 'm@example.com', phone: '214-555-0101', age: 38, attending: false },
        attendees: [person('a1', 'Raj', 40, day(D10))],
      }),
    );
    expect(r.ok).toBe(true);
  });
});

describe('validateBooking: tickets by age band', () => {
  it('rejects a 5-year-old with ticket none', () => {
    const errors = errorsOf(
      booking({ attendees: [person('a1', 'Meera Shah', 38, day(D10)), person('a2', 'Five', 5, { kind: 'none' })] }),
    );
    expect(errors.map((e) => e.path)).toEqual(['attendees.1.ticket']);
    expect(errors[0]?.message).toMatch(/5 or over needs a ticket/);
  });

  it('rejects an adult with ticket none', () => {
    expect(pathsOf(booking({ attendees: [person('a1', 'Meera Shah', 38, { kind: 'none' })] }))).toContain(
      'attendees.0.ticket',
    );
  });

  it('rejects a toddler on a Day or All-Day ticket (they come in free)', () => {
    const base = person('a1', 'Meera Shah', 38, day(D10));
    expect(pathsOf(booking({ attendees: [base, person('a2', 'Tiny', 3, day(D10))] }))).toEqual(['attendees.1.ticket']);
    expect(pathsOf(booking({ attendees: [base, person('a2', 'Tiny', 3, { kind: 'allDay' })] }))).toEqual([
      'attendees.1.ticket',
    ]);
  });

  it('rejects a Day ticket with no days', () => {
    expect(pathsOf(booking({ attendees: [person('a1', 'Meera Shah', 38, day())] }))).toEqual([
      'attendees.0.ticket.days',
    ]);
  });
});

describe('validateBooking: family passes (D2)', () => {
  const four = (extra: Attendee[]) => [
    person('a1', 'Meera Shah', 38, onPass('p1')),
    person('a2', 'Raj', 40, onPass('p1')),
    ...extra,
  ];

  it('rejects a family pass with 3 adults', () => {
    const errors = errorsOf(
      booking({ attendees: four([person('a3', 'Nani', 65, onPass('p1'))]), familyPasses: [pass('p1')] }),
    );
    expect(errors.map((e) => e.path)).toEqual(['familyPasses.0']);
    expect(errors[0]?.code).toBe('family_too_many_adults');
  });

  it('rejects a family pass with 3 children', () => {
    const errors = errorsOf(
      booking({
        attendees: four([
          person('a3', 'C1', 6, onPass('p1')),
          person('a4', 'C2', 7, onPass('p1')),
          person('a5', 'C3', 8, onPass('p1')),
        ]),
        familyPasses: [pass('p1')],
      }),
    );
    expect(errors.map((e) => e.code)).toEqual(['family_too_many_children']);
  });

  it('rejects a family pass with 0 adults', () => {
    const errors = errorsOf(
      booking({
        booker: { name: 'Raj', email: 'r@example.com', phone: '214-555-0101', age: 40, attending: false },
        attendees: [person('a1', 'C1', 6, onPass('p1')), person('a2', 'T', 2, onPass('p1'))],
        familyPasses: [pass('p1')],
      }),
    );
    expect(errors.map((e) => e.code)).toContain('family_needs_adult');
  });

  it('counts a 12-year-old as an adult on a pass', () => {
    const errors = errorsOf(
      booking({
        attendees: [
          person('a1', 'Meera Shah', 38, onPass('p1')),
          person('a2', 'Teen', 12, onPass('p1')),
          person('a3', 'Third', 13, onPass('p1')),
        ],
        familyPasses: [pass('p1')],
      }),
    );
    expect(errors.map((e) => e.code)).toEqual(['family_too_many_adults']);
  });

  it('rejects an empty pass left behind after an attendee was removed', () => {
    const errors = errorsOf(
      booking({
        attendees: [person('a1', 'Meera Shah', 38, onPass('p1'))],
        familyPasses: [pass('p1'), pass('p2', D12)],
      }),
    );
    expect(errors.map((e) => e.path)).toEqual(['familyPasses.1']);
    expect(errors[0]?.code).toBe('family_pass_empty');
  });

  it('rejects a ticket pointing at a pass that does not exist', () => {
    const errors = errorsOf(booking({ attendees: [person('a1', 'Meera Shah', 38, onPass('ghost'))] }));
    expect(errors.map((e) => e.path)).toEqual(['attendees.0.ticket.passId']);
  });
});

describe('validateBooking: extras follow entry (D5, D6)', () => {
  it('rejects dinner on a day without entry', () => {
    const errors = errorsOf(
      booking({ attendees: [person('a1', 'Meera Shah', 38, day(D10), { dinnerDays: [D11] })] }),
    );
    expect(errors.map((e) => e.path)).toEqual(['attendees.0.dinnerDays.0']);
    expect(errors[0]?.message).toMatch(/Nov 11/);
  });

  it('allows dinner on any day for an All-Day ticket', () => {
    const r = validateBooking(
      booking({ attendees: [person('a1', 'Meera Shah', 38, { kind: 'allDay' }, { dinnerDays: [D10, D12] })] }),
    );
    expect(r.ok).toBe(true);
  });

  it('rejects Garba on a day without entry', () => {
    const errors = errorsOf(booking({ attendees: [person('a1', 'Meera Shah', 38, day(D10), { garbaDays: [D11] })] }));
    expect(errors.map((e) => e.path)).toEqual(['attendees.0.garbaDays.0']);
  });

  it('rejects Garba for under-5s (workshop minimum age is 5, same as the child band)', () => {
    const errors = errorsOf(
      booking({
        attendees: [
          person('a1', 'Meera Shah', 38, day(D11)),
          person('a2', 'Tiny', 3, { kind: 'none' }, { garbaDays: [D11] }),
        ],
      }),
    );
    expect(errors.map((e) => e.path)).toEqual(['attendees.1.garbaDays']);
  });

  it('gives a toddler without a ticket the group entry days for dinner', () => {
    const attendees = [
      person('a1', 'Meera Shah', 38, day(D10, D11)),
      person('a2', 'Tiny', 3, { kind: 'none' }, { dinnerDays: [D10, D11] }),
    ];
    expect(validateBooking(booking({ attendees })).ok).toBe(true);
    const tooMany = [attendees[0] as Attendee, person('a2', 'Tiny', 3, { kind: 'none' }, { dinnerDays: [D12] })];
    expect(pathsOf(booking({ attendees: tooMany }))).toEqual(['attendees.1.dinnerDays.0']);
  });
});

describe('entryDays', () => {
  it('derives days from each ticket kind', () => {
    const b = booking({
      attendees: [
        person('a1', 'Meera Shah', 38, day(D11, D10)),
        person('a2', 'Raj', 40, onPass('p1')),
        person('a3', 'Tiny', 3, { kind: 'none' }),
      ],
      familyPasses: [pass('p1', D12)],
    });
    const [a1, a2, a3] = b.attendees as [Attendee, Attendee, Attendee];
    expect(entryDays(a1, b)).toEqual([D10, D11]);
    expect(entryDays(a2, b)).toEqual([D12]);
    expect(entryDays(a3, b)).toEqual([D10, D11, D12]);
  });
});

describe('validateBooking: group rules (D8)', () => {
  it('rejects children with no 18+ adult in the group', () => {
    const errors = errorsOf(
      booking({
        booker: { name: 'Raj', email: 'r@example.com', phone: '214-555-0101', age: 40, attending: false },
        attendees: [person('a1', 'Teen', 15, day(D10)), person('a2', 'Kid', 8, day(D10))],
      }),
    );
    expect(errors.map((e) => e.code)).toEqual(['needs_adult_supervisor']);
    expect(errors[0]?.path).toBe('attendees');
  });

  it('rejects an all-toddler group', () => {
    const errors = errorsOf(
      booking({
        booker: { name: 'Raj', email: 'r@example.com', phone: '214-555-0101', age: 40, attending: false },
        attendees: [person('a1', 'Tiny', 3, { kind: 'none' })],
      }),
    );
    expect(errors.map((e) => e.code)).toContain('needs_adult_supervisor');
  });

  it('does not require 18+ when everyone is 12 or over', () => {
    const r = validateBooking(
      booking({
        booker: { name: 'Raj', email: 'r@example.com', phone: '214-555-0101', age: 40, attending: false },
        attendees: [person('a1', 'Teen', 15, day(D10)), person('a2', 'Teen2', 13, day(D10))],
      }),
    );
    expect(r.ok).toBe(true);
  });
});

describe('validateBooking: identity and error collection', () => {
  it('rejects duplicate attendee ids and duplicate pass ids', () => {
    const errors = errorsOf(
      booking({
        attendees: [person('a1', 'Meera Shah', 38, onPass('p1')), person('a1', 'Raj', 40, onPass('p1'))],
        familyPasses: [pass('p1'), pass('p1')],
      }),
    );
    expect(errors.map((e) => e.path)).toEqual(['attendees.1.id', 'familyPasses.1.id']);
  });

  it('collects all rule errors at once, each with a path and a message', () => {
    const errors = errorsOf(
      booking({
        booker: { name: 'Teen', email: 't@example.com', phone: '214-555-0101', age: 17, attending: false },
        attendees: [
          person('a1', 'Kid', 8, { kind: 'none' }, { dinnerDays: [D11] }),
          person('a2', 'Other Kid', 9, day()),
        ],
      }),
    );
    expect(errors.length).toBeGreaterThanOrEqual(4);
    expect(errors.map((e) => e.path)).toEqual(
      expect.arrayContaining(['booker.age', 'attendees.0.ticket', 'attendees.1.ticket.days', 'attendees']),
    );
    for (const e of errors) {
      expect(e.message.length).toBeGreaterThan(10);
      expect(e.code).toBeTruthy();
    }
  });

  it('returns schema errors (not rule errors) for a malformed body', () => {
    expect(pathsOf({ nonsense: true })).toContain('booker');
    expect(errorsOf(null).length).toBeGreaterThan(0);
  });
});
