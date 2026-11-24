import { describe, it, expect } from 'vite-plus/test';
import { bookingRequestSchema, zodErrorToRuleErrors } from '../src/domain/schema';

const adult = {
  id: 'a1',
  name: 'Meera Shah',
  age: 38,
  ticket: { kind: 'day', days: ['2026-11-10'] },
  dinnerDays: [],
  garbaDays: [],
};

const base = {
  booker: { name: 'Meera Shah', email: 'meera@example.com', phone: '+1 (214) 555-0101', age: 38, attending: true },
  attendees: [adult],
  familyPasses: [],
  dandiyaQty: 0,
};

/** Parse and return the rule errors (empty array when the shape is fine). */
function errorsFor(input: unknown) {
  const r = bookingRequestSchema.safeParse(input);
  return r.success ? [] : zodErrorToRuleErrors(r.error);
}

const withAttendee = (patch: object) => ({ ...base, attendees: [{ ...adult, ...patch }] });

describe('bookingRequestSchema', () => {
  it('accepts a well-formed request and trims names', () => {
    const r = bookingRequestSchema.safeParse(withAttendee({ name: '  Meera  ' }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.attendees[0]?.name).toBe('Meera');
  });

  it.each([
    ['a string with trailing junk', '12abc'],
    ['a numeric string', '12'],
    ['a negative', -1],
    ['a float', 3.5],
    ['too large', 999],
    ['null', null],
    ['NaN', Number.NaN],
  ])('rejects an age that is %s', (_label, age) => {
    const errors = errorsFor(withAttendee({ age }));
    expect(errors.map((e) => e.path)).toContain('attendees.0.age');
    expect(errors.find((e) => e.path === 'attendees.0.age')?.message).toBe(
      'Age must be a whole number between 0 and 120.',
    );
  });

  it('rejects a missing age with the same friendly message', () => {
    const { age: _age, ...noAge } = adult;
    const errors = errorsFor({ ...base, attendees: [noAge] });
    expect(errors.find((e) => e.path === 'attendees.0.age')?.message).toMatch(/whole number/);
  });

  it('rejects an injected priceCents at the top level', () => {
    const errors = errorsFor({ ...base, priceCents: 1 });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe('priceCents');
    expect(errors[0]?.message).toMatch(/server/i);
  });

  it('rejects injected price fields at attendee, ticket, booker and pass level', () => {
    expect(errorsFor(withAttendee({ priceCents: 0 })).map((e) => e.path)).toEqual(['attendees.0.priceCents']);
    expect(
      errorsFor(withAttendee({ ticket: { kind: 'day', days: ['2026-11-10'], total: 0 } })).map((e) => e.path),
    ).toEqual(['attendees.0.ticket.total']);
    expect(errorsFor({ ...base, booker: { ...base.booker, discount: 5 } }).map((e) => e.path)).toEqual([
      'booker.discount',
    ]);
    expect(
      errorsFor({ ...base, familyPasses: [{ id: 'p1', day: '2026-11-10', priceCents: 1 }] }).map((e) => e.path),
    ).toEqual(['familyPasses.0.priceCents']);
  });

  it('rejects a Garba day outside the workshop days', () => {
    const errors = errorsFor(withAttendee({ garbaDays: ['2026-11-12'] }));
    expect(errors.map((e) => e.path)).toEqual(['attendees.0.garbaDays.0']);
    expect(errors[0]?.message).toMatch(/Nov 11 and Nov 13/);
  });

  it('rejects a day that is not a festival day', () => {
    const errors = errorsFor(withAttendee({ dinnerDays: ['2026-11-15'] }));
    expect(errors.map((e) => e.path)).toEqual(['attendees.0.dinnerDays.0']);
  });

  it('rejects duplicate days in every day list', () => {
    const dup = ['2026-11-10', '2026-11-10'];
    expect(errorsFor(withAttendee({ dinnerDays: dup })).map((e) => e.path)).toEqual(['attendees.0.dinnerDays']);
    expect(errorsFor(withAttendee({ garbaDays: ['2026-11-11', '2026-11-11'] })).map((e) => e.path)).toEqual([
      'attendees.0.garbaDays',
    ]);
    expect(errorsFor(withAttendee({ ticket: { kind: 'day', days: dup } })).map((e) => e.path)).toEqual([
      'attendees.0.ticket.days',
    ]);
  });

  it('rejects an unknown ticket kind', () => {
    const errors = errorsFor(withAttendee({ ticket: { kind: 'vip' } }));
    expect(errors.map((e) => e.path)).toEqual(['attendees.0.ticket.kind']);
    expect(errors[0]?.message).toMatch(/choose a ticket type/);
  });

  it('rejects empty and over-long names', () => {
    expect(errorsFor(withAttendee({ name: '   ' })).map((e) => e.path)).toEqual(['attendees.0.name']);
    expect(errorsFor(withAttendee({ name: 'x'.repeat(81) })).map((e) => e.path)).toEqual(['attendees.0.name']);
  });

  it('rejects bad attendee ids', () => {
    expect(errorsFor(withAttendee({ id: '' })).map((e) => e.path)).toEqual(['attendees.0.id']);
    expect(errorsFor(withAttendee({ id: 'has space' })).map((e) => e.path)).toEqual(['attendees.0.id']);
    expect(errorsFor(withAttendee({ id: 'x'.repeat(41) })).map((e) => e.path)).toEqual(['attendees.0.id']);
  });

  it('rejects bad email and phone', () => {
    expect(errorsFor({ ...base, booker: { ...base.booker, email: 'nope' } }).map((e) => e.path)).toEqual([
      'booker.email',
    ]);
    expect(errorsFor({ ...base, booker: { ...base.booker, phone: 'call me' } }).map((e) => e.path)).toEqual([
      'booker.phone',
    ]);
  });

  it('enforces attendee, pass and dandiya limits', () => {
    expect(errorsFor({ ...base, attendees: [] }).map((e) => e.path)).toEqual(['attendees']);
    const many = Array.from({ length: 21 }, (_v, i) => ({ ...adult, id: `a${i}` }));
    expect(errorsFor({ ...base, attendees: many }).map((e) => e.path)).toEqual(['attendees']);
    const passes = Array.from({ length: 11 }, (_v, i) => ({ id: `p${i}`, day: '2026-11-10' }));
    expect(errorsFor({ ...base, familyPasses: passes }).map((e) => e.path)).toEqual(['familyPasses']);
    expect(errorsFor({ ...base, dandiyaQty: 21 }).map((e) => e.path)).toEqual(['dandiyaQty']);
    expect(errorsFor({ ...base, dandiyaQty: 1.5 }).map((e) => e.path)).toEqual(['dandiyaQty']);
    expect(errorsFor({ ...base, dandiyaQty: -1 }).map((e) => e.path)).toEqual(['dandiyaQty']);
  });

  it('limits promoCode length and type', () => {
    expect(bookingRequestSchema.safeParse({ ...base, promoCode: 'SEVA10' }).success).toBe(true);
    expect(errorsFor({ ...base, promoCode: 'x'.repeat(33) }).map((e) => e.path)).toEqual(['promoCode']);
    expect(errorsFor({ ...base, promoCode: 5 }).map((e) => e.path)).toEqual(['promoCode']);
  });

  it.each([null, undefined, 'booking', 42, []])('rejects a non-object body (%s)', (body) => {
    const errors = errorsFor(body);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => typeof e.message === 'string' && e.message.length > 0)).toBe(true);
  });
});
