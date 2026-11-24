import type { BookingResult, CatalogView, SavedBooking } from '../api/schemas';
import type { FestivalDay, GarbaDay } from '../domain/catalog';
import type { Quote, RuleError } from '../domain/types';

export type BookingAction =
  // who is booking and who is coming
  | { readonly type: 'bookerEdited'; readonly field: 'name' | 'email' | 'phone' | 'age'; readonly value: string }
  | { readonly type: 'attendingToggled'; readonly attending: boolean }
  | { readonly type: 'personAdded'; readonly id: string }
  | { readonly type: 'personRemoved'; readonly id: string }
  | { readonly type: 'personEdited'; readonly id: string; readonly field: 'name' | 'age'; readonly value: string }
  // tickets
  | { readonly type: 'ticketKindChosen'; readonly personId: string; readonly kind: 'day' | 'allDay' }
  | { readonly type: 'dayPassDaysChosen'; readonly personId: string; readonly days: readonly FestivalDay[] }
  | { readonly type: 'passAdded'; readonly id: string; readonly day: FestivalDay; readonly personId?: string }
  | { readonly type: 'passJoined'; readonly personId: string; readonly passId: string }
  | { readonly type: 'passDayChosen'; readonly passId: string; readonly day: FestivalDay }
  | { readonly type: 'passRemoved'; readonly passId: string }
  // extras, promo, card
  | { readonly type: 'dinnerDaysChosen'; readonly personId: string; readonly days: readonly FestivalDay[] }
  | { readonly type: 'garbaDaysChosen'; readonly personId: string; readonly days: readonly GarbaDay[] }
  | { readonly type: 'dandiyaChosen'; readonly qty: number }
  | { readonly type: 'promoApplied'; readonly code: string }
  | { readonly type: 'cardEdited'; readonly value: string }
  // navigation
  | { readonly type: 'nextClicked' }
  | { readonly type: 'backClicked' }
  | { readonly type: 'keyIssued'; readonly key: string }
  | { readonly type: 'startedOver' }
  // server answers: quote
  | { readonly type: 'quoteLoaded'; readonly quote: Quote }
  | { readonly type: 'quoteRejected'; readonly errors: readonly RuleError[] }
  | { readonly type: 'quoteUnavailable'; readonly offline: boolean }
  | { readonly type: 'quoteRefreshRequested' }
  // server answers: catalog
  | { readonly type: 'catalogLoaded'; readonly catalog: CatalogView }
  | { readonly type: 'catalogUnavailable'; readonly offline: boolean }
  // paying
  | { readonly type: 'payStarted' }
  | { readonly type: 'payConfirmed'; readonly result: BookingResult }
  | { readonly type: 'payRejected'; readonly status: number; readonly code: string; readonly message: string; readonly fields: readonly RuleError[] }
  | { readonly type: 'payOffline' }
  | { readonly type: 'payFailed'; readonly message: string }
  | { readonly type: 'confirmationRestored'; readonly saved: SavedBooking };
