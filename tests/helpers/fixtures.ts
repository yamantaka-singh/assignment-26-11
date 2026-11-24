import type { Attendee, BookingRequest, EntryTicket } from '../../src/domain/types';

export const NOW = new Date('2026-11-24T12:00:00Z');
export const D10 = '2026-11-10';
export const D11 = '2026-11-11';
export const APPROVED = { cardNumber: '4242 4242 4242 4242' };
export const DECLINED = { cardNumber: '4000 0000 0000 0002' };

export const person = (id: string, name: string, age: number, ticket: EntryTicket, extra: Partial<Attendee> = {}): Attendee => ({
  id,
  name,
  age,
  ticket,
  dinnerDays: [],
  garbaDays: [],
  ...extra,
});

/** One adult on a Day Pass for Nov 10: $15. Override fields to build other bookings. */
export const booking = (overrides: Partial<BookingRequest> = {}): BookingRequest => ({
  booker: { name: 'Meera Shah', email: 'meera@example.com', phone: '214-555-0101', age: 38, attending: true },
  attendees: [person('a1', 'Meera Shah', 38, { kind: 'day', days: [D10] })],
  familyPasses: [],
  dandiyaQty: 0,
  ...overrides,
});

/** n adults, each with a Day Pass and a Garba workshop on Nov 11. */
export const garbaGroup = (n: number): BookingRequest =>
  booking({
    attendees: Array.from({ length: n }, (_, i) =>
      person(`a${i + 1}`, i === 0 ? 'Meera Shah' : `Guest ${i + 1}`, i === 0 ? 38 : 30, { kind: 'day', days: [D11] }, { garbaDays: [D11] }),
    ),
  });
