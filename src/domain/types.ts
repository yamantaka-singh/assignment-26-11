// Shared domain + API contract. Server and UI both import this; only the server's numbers count.
import type { FestivalDay, GarbaDay, ItemId, PromoCode } from './catalog';

export type AgeBand = 'toddler' | 'child' | 'adult';

/** What one person is admitted on. Exactly one kind per person. */
export type EntryTicket =
  | { readonly kind: 'day'; readonly days: readonly FestivalDay[] }
  | { readonly kind: 'allDay' }
  | { readonly kind: 'family'; readonly passId: string }
  | { readonly kind: 'none' }; // under-5s only

export interface Attendee {
  readonly id: string;
  readonly name: string;
  readonly age: number;
  readonly ticket: EntryTicket;
  readonly dinnerDays: readonly FestivalDay[];
  readonly garbaDays: readonly GarbaDay[];
}

export interface FamilyPass {
  readonly id: string;
  readonly day: FestivalDay;
}

export interface Booker {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly age: number;
  /** When true, attendees[0] is the booker. */
  readonly attending: boolean;
}

/** The request body for /api/quote and /api/bookings. Never contains prices. */
export interface BookingRequest {
  readonly booker: Booker;
  readonly attendees: readonly Attendee[];
  readonly familyPasses: readonly FamilyPass[];
  readonly dandiyaQty: number;
  readonly promoCode?: string;
}

declare const validBrand: unique symbol;
/** Brand: only validateBooking() can produce one. */
export type ValidBooking = BookingRequest & { readonly [validBrand]: true };

export interface RuleError {
  readonly code: string;
  /** Dot path into BookingRequest, e.g. "attendees.2.age". Empty for booking-wide errors. */
  readonly path: string;
  readonly message: string;
}

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export interface PromoRecord {
  readonly code: PromoCode;
  readonly kind: 'percent' | 'flat' | 'kids-free';
  /** percent: whole percent; flat: cents; kids-free: 0. */
  readonly value: number;
  readonly expiresAt: string | null; // ISO date-time
  readonly maxUses: number | null;
  readonly uses: number;
}

export type PromoResult =
  | { readonly status: 'none' }
  | { readonly status: 'applied'; readonly code: PromoCode; readonly kind: PromoRecord['kind']; readonly value: number; readonly message: string }
  | { readonly status: 'unknown' | 'expired' | 'exhausted' | 'not-applicable'; readonly code: string; readonly message: string };

export interface QuoteLine {
  readonly itemId: ItemId;
  readonly label: string;
  readonly attendeeId?: string;
  readonly day?: FestivalDay;
  readonly qty: number;
  readonly unitCents: number;
  readonly totalCents: number;
}

export interface Quote {
  readonly lines: readonly QuoteLine[];
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
  readonly promo: PromoResult;
  /** Non-blocking advice, e.g. "a Family Pass would be cheaper". */
  readonly hints: readonly string[];
  /** Stock units this booking consumes, keyed by item. */
  readonly stockNeeded: Readonly<Partial<Record<ItemId, number>>>;
}

export interface ApiError {
  readonly error: { readonly code: string; readonly message: string; readonly fields?: readonly RuleError[] };
}
