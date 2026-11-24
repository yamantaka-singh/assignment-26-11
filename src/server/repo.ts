// The persistence contract. Services depend on this, never on void/db, so tests can inject a fake.
import type { ItemId } from '../domain/catalog';
import type { Attendee, Booker, PromoRecord, Quote } from '../domain/types';

export interface BookingRecord {
  readonly id: string;
  readonly reference: string;
  readonly idempotencyKey: string;
  /** SHA-256 of the canonical request, so a reused key with a different body is detectable. */
  readonly requestHash: string;
  readonly booker: Booker;
  readonly attendees: readonly Attendee[];
  readonly quote: Quote;
  readonly amountCents: number;
  readonly status: 'confirmed';
  readonly createdAt: string;
}

export type NewBooking = Omit<BookingRecord, 'createdAt'>;

export type CommitResult =
  | { readonly kind: 'created' }
  | { readonly kind: 'stock-conflict' } // a CHECK on inventory rejected the batch: someone else took the stock
  | { readonly kind: 'promo-conflict' } // a CHECK on promo_codes rejected the batch: the code ran out
  | { readonly kind: 'duplicate-key' }; // the idempotency key already has a booking

export interface Repo {
  getInventory(): Promise<Readonly<Record<string, number>>>;
  /** `code` is already normalised (trimmed, upper-case). */
  getPromo(code: string): Promise<PromoRecord | undefined>;
  findBookingByIdempotencyKey(key: string): Promise<BookingRecord | undefined>;
  getBooking(id: string): Promise<BookingRecord | undefined>;
  /** Stock decrement + promo use + booking insert as ONE atomic unit. */
  commitBooking(booking: NewBooking): Promise<CommitResult>;
}

export const remainingOf = (inventory: Readonly<Record<string, number>>, id: ItemId): number => inventory[id] ?? 0;
