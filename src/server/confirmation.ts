// What GET /api/bookings/:id shows. Deliberately small: booker name + email only, no phone, no card data.
import { formatFestivalDay } from '../domain/catalog';
import type { Attendee, Quote } from '../domain/types';
import type { BookingRecord } from './repo';

const ticketSummary = (a: Attendee): string => {
  switch (a.ticket.kind) {
    case 'day':
      return `Day Pass: ${a.ticket.days.map(formatFestivalDay).join(', ')}`;
    case 'allDay':
      return 'All-Day Pass';
    case 'family':
      return 'Family Pass';
    case 'none':
      return 'Free entry (under 5)';
  }
};

export interface Confirmation {
  readonly bookingId: string;
  readonly reference: string;
  readonly booker: { readonly name: string; readonly email: string };
  readonly attendees: readonly { readonly name: string; readonly ticket: string }[];
  readonly quote: Quote;
  readonly createdAt: string;
}

export const toConfirmation = (r: BookingRecord): Confirmation => ({
  bookingId: r.id,
  reference: r.reference,
  booker: { name: r.booker.name, email: r.booker.email },
  attendees: r.attendees.map((a) => ({ name: a.name, ticket: ticketSummary(a) })),
  quote: r.quote,
  createdAt: r.createdAt,
});
