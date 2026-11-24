// The booking draft the UI edits, and the pure helpers around it. No React, no fetch.
// Nothing here prices anything: the payable total is always the server's Quote.
import {
  FAMILY_PASS_MAX_ADULTS,
  FAMILY_PASS_MAX_CHILDREN,
  FESTIVAL_DAYS,
  formatFestivalDay,
  MAX_AGE,
  MIN_AGE,
  type FestivalDay,
  type GarbaDay,
  type ItemId,
} from '../domain/catalog';
import { ageBand, entryDays } from '../domain/eligibility';
import type { AgeBand, Attendee, BookingRequest, EntryTicket, FamilyPass, Quote, RuleError } from '../domain/types';

export const BOOKER_ID = 'booker';
export const NO_TICKET: EntryTicket = { kind: 'none' };

export const FORM_STEPS = ['group', 'tickets', 'extras', 'review'] as const;
export type FormStep = (typeof FORM_STEPS)[number];
export type StepId = FormStep | 'paying' | 'confirmed';

export interface Person {
  readonly id: string;
  readonly name: string;
  /** What the person typed. Kept as text so "1" then "12" is not lost and "12abc" can be flagged. */
  readonly ageInput: string;
  /** The parsed age, or null while the text is not a valid whole number. */
  readonly age: number | null;
  readonly ticket: EntryTicket;
  readonly dinnerDays: readonly FestivalDay[];
  readonly garbaDays: readonly GarbaDay[];
}

export interface BookerDraft {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly ageInput: string;
  readonly age: number | null;
  readonly attending: boolean;
}

export interface Draft {
  readonly booker: BookerDraft;
  /** When booker.attending, people[0] is the booker (id BOOKER_ID). */
  readonly people: readonly Person[];
  readonly passes: readonly FamilyPass[];
  readonly dandiyaQty: number;
  readonly promoCode: string;
}

// ---------- age ----------

const AGE_TEXT = /^\d{1,3}$/;

export function parseAge(input: string): number | null {
  const text = input.trim();
  if (!AGE_TEXT.test(text)) return null;
  const age = Number(text);
  return age <= MAX_AGE ? age : null;
}

export function ageProblem(input: string): string | null {
  if (input.trim() === '') return 'Please enter an age.';
  return parseAge(input) === null ? `Age must be a whole number between ${MIN_AGE} and ${MAX_AGE}.` : null;
}

export const bandOf = (age: number | null): AgeBand | null => (age === null ? null : ageBand(age));

export const emptyPerson = (id: string): Person => ({
  id,
  name: '',
  ageInput: '',
  age: null,
  ticket: NO_TICKET,
  dinnerDays: [],
  garbaDays: [],
});

/** Apply typed age text. A change of age band drops the ticket: it may no longer fit. */
export function withAgeInput(person: Person, ageInput: string): Person {
  const age = parseAge(ageInput);
  const bandChanged = bandOf(age) !== bandOf(person.age);
  return { ...person, ageInput, age, ticket: bandChanged ? NO_TICKET : person.ticket, garbaDays: bandChanged ? [] : person.garbaDays };
}

// ---------- draft -> request ----------

const promoOf = (draft: Draft): { promoCode?: string } => {
  const promoCode = draft.promoCode.trim();
  return promoCode === '' ? {} : { promoCode };
};

const toAttendee = (p: Person, age: number): Attendee => ({
  id: p.id,
  name: p.name,
  age,
  ticket: p.ticket,
  dinnerDays: p.dinnerDays,
  garbaDays: p.garbaDays,
});

function requestWith(draft: Draft, ageFor: (p: Person) => number | null, bookerAge: number | null): BookingRequest | null {
  const ages = draft.people.map(ageFor);
  if (bookerAge === null || ages.some((a) => a === null)) return null;
  const attendees = draft.people.flatMap((p, i) => {
    const age = ages[i];
    return age === undefined || age === null ? [] : [toAttendee(p, age)];
  });
  const { name, email, phone, attending } = draft.booker;
  return {
    booker: { name, email, phone, age: bookerAge, attending },
    attendees,
    familyPasses: draft.passes,
    dandiyaQty: draft.dandiyaQty,
    ...promoOf(draft),
  };
}

/** The exact body for /api/quote and /api/bookings, or null while any age is not a number yet. */
export const buildRequest = (draft: Draft): BookingRequest | null =>
  requestWith(draft, (p) => p.age, draft.booker.age);

/** For instant hints only (which days a person may add extras on): unknown ages count as 0. */
const looseRequest = (draft: Draft): BookingRequest =>
  requestWith(draft, (p) => p.age ?? 0, 0) ?? { booker: { ...draft.booker, age: 0 }, attendees: [], familyPasses: [], dandiyaQty: 0 };

export function entryDaysOf(draft: Draft, personId: string): FestivalDay[] {
  const request = looseRequest(draft);
  const attendee = request.attendees.find((a) => a.id === personId);
  return attendee === undefined ? [] : entryDays(attendee, request);
}

/**
 * Keep the draft self-consistent after any edit: tickets point at real passes, passes have members,
 * and dinner/Garba only exist on days (and for ages) that the person's entry covers.
 */
export function normalizeDraft(draft: Draft): Draft {
  const passIds = new Set(draft.passes.map((p) => p.id));
  const people = draft.people.map((p) =>
    p.ticket.kind === 'family' && !passIds.has(p.ticket.passId) ? { ...p, ticket: NO_TICKET } : p,
  );
  const usedPassIds = new Set(people.flatMap((p) => (p.ticket.kind === 'family' ? [p.ticket.passId] : [])));
  const base: Draft = { ...draft, people, passes: draft.passes.filter((p) => usedPassIds.has(p.id)) };
  const prunedPeople = base.people.map((p) => {
    const entry = entryDaysOf(base, p.id);
    const canGarba = bandOf(p.age) === 'child' || bandOf(p.age) === 'adult';
    return {
      ...p,
      dinnerDays: p.dinnerDays.filter((d) => entry.includes(d)),
      garbaDays: canGarba ? p.garbaDays.filter((d) => entry.includes(d)) : [],
    };
  });
  return { ...base, people: prunedPeople };
}

/** Stable identity of what the server would be asked, so identical drafts are not re-quoted. */
export const requestKey = (draft: Draft): string => JSON.stringify(buildRequest(draft));

// ---------- people and passes ----------

export const countByBand = (draft: Draft, passId: string, band: AgeBand): number =>
  draft.people.filter((p) => p.ticket.kind === 'family' && p.ticket.passId === passId && bandOf(p.age) === band).length;

/** A family pass takes up to 2 adults and 2 children. False if this person is already on it. */
export function hasRoom(draft: Draft, person: Person, passId: string): boolean {
  const band = bandOf(person.age);
  if (person.ticket.kind === 'family' && person.ticket.passId === passId) return false;
  if (band === 'adult') return countByBand(draft, passId, 'adult') < FAMILY_PASS_MAX_ADULTS;
  if (band === 'child') return countByBand(draft, passId, 'child') < FAMILY_PASS_MAX_CHILDREN;
  return false;
}

export const personLabel = (p: Person, index: number): string => (p.name.trim() === '' ? `Person ${index + 1}` : p.name.trim());

export const sortDays = (days: readonly FestivalDay[]): FestivalDay[] => FESTIVAL_DAYS.filter((d) => days.includes(d));

/** Plain-words ticket for lists and the confirmation. Display only: no rule depends on this text. */
export function describeTicket(p: Person, passes: readonly FamilyPass[]): string {
  switch (p.ticket.kind) {
    case 'day':
      return `Day Pass: ${sortDays(p.ticket.days).map(formatFestivalDay).join(', ')}`;
    case 'allDay':
      return 'All-Day Pass (all 5 days)';
    case 'family': {
      const passId = p.ticket.passId;
      const pass = passes.find((x) => x.id === passId);
      return pass ? `Family Pass: ${formatFestivalDay(pass.day)}` : 'Family Pass';
    }
    case 'none':
      return bandOf(p.age) === 'toddler' ? 'Free entry (under 5)' : 'No ticket chosen yet';
  }
}

// ---------- server errors -> steps ----------

const STOCK_PREFIX = 'stock.';
const EXTRAS_ITEMS: readonly string[] = ['dinner', 'garba', 'dandiya'] satisfies readonly ItemId[];

/** Which step a server RuleError belongs to, from its dot path. */
export function stepOfPath(path: string): FormStep {
  if (path.startsWith(STOCK_PREFIX)) return EXTRAS_ITEMS.includes(path.slice(STOCK_PREFIX.length)) ? 'extras' : 'tickets';
  const [root, , field] = path.split('.');
  if (root === 'booker' || root === 'attendees') {
    if (field === 'ticket') return 'tickets';
    if (field === 'dinnerDays' || field === 'garbaDays') return 'extras';
    return 'group';
  }
  if (root === 'familyPasses') return 'tickets';
  if (root === 'dandiyaQty') return 'extras';
  if (root === 'promoCode') return 'review';
  return path === '' ? 'group' : 'review';
}

export const stepIndex = (step: FormStep): number => FORM_STEPS.indexOf(step);

export const errorsUpTo = (errors: readonly RuleError[], step: FormStep): RuleError[] =>
  errors.filter((e) => stepIndex(stepOfPath(e.path)) <= stepIndex(step));

export const uniqueMessages = (errors: readonly RuleError[]): string[] => [...new Set(errors.map((e) => e.message))];

/** Message(s) for a field path or anything beneath it ("attendees.1.dinnerDays" covers ".0"). */
export function messageAt(errors: readonly RuleError[], path: string): string | undefined {
  const found = errors.filter((e) => e.path === path || e.path.startsWith(`${path}.`));
  return found.length === 0 ? undefined : uniqueMessages(found).join(' ');
}

/** Only an error for exactly this path (messageAt also matches everything beneath it). */
export const exactAt = (errors: readonly RuleError[], path: string): string | undefined => {
  const found = errors.filter((e) => e.path === path);
  return found.length === 0 ? undefined : uniqueMessages(found).join(' ');
};

export type QuoteStatus = 'idle' | 'loading' | 'ready' | 'error' | 'offline';
export type QuoteView = { readonly quote: Quote | null; readonly status: QuoteStatus };
