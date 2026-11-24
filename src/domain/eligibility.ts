// Business rules on a structurally valid request. Stock is NOT checked here: the server owns it.
// All rules run and all errors are returned, so the person can fix everything in one pass.
import {
  ADULT_MIN_AGE,
  BOOKER_MIN_AGE,
  CHILD_MIN_AGE,
  FAMILY_PASS_MAX_ADULTS,
  FAMILY_PASS_MAX_CHILDREN,
  FESTIVAL_DAYS,
  type FestivalDay,
} from './catalog';
import { bookingRequestSchema, zodErrorToRuleErrors } from './schema';
import type {
  AgeBand,
  Attendee,
  BookingRequest,
  EntryTicket,
  FamilyPass,
  Result,
  RuleError,
  ValidBooking,
} from './types';

export function ageBand(age: number): AgeBand {
  if (age < CHILD_MIN_AGE) return 'toddler';
  if (age < ADULT_MIN_AGE) return 'child';
  return 'adult';
}

const ticketDays = (ticket: EntryTicket, passes: readonly FamilyPass[]): readonly FestivalDay[] => {
  switch (ticket.kind) {
    case 'day':
      return ticket.days;
    case 'allDay':
      return FESTIVAL_DAYS;
    case 'family': {
      const pass = passes.find((p) => p.id === ticket.passId);
      return pass ? [pass.day] : [];
    }
    case 'none':
      return [];
  }
};

const inFestivalOrder = (days: readonly FestivalDay[]): FestivalDay[] =>
  FESTIVAL_DAYS.filter((d) => days.includes(d));

/**
 * Days this person is let in, in festival order. A toddler with no ticket comes in
 * with the family, so they get the union of everyone else's days (D1, D6).
 */
export function entryDays(attendee: Attendee, booking: BookingRequest): FestivalDay[] {
  if (attendee.ticket.kind !== 'none') return inFestivalOrder(ticketDays(attendee.ticket, booking.familyPasses));
  return inFestivalOrder(booking.attendees.flatMap((a) => ticketDays(a.ticket, booking.familyPasses)));
}

const err = (code: string, path: string, message: string): RuleError => ({ code, path, message });

const dayLabel = (day: FestivalDay): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const duplicates = (ids: readonly string[]): number[] =>
  ids.flatMap((id, i) => (ids.indexOf(id) < i ? [i] : []));

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

function identityRules(b: BookingRequest): RuleError[] {
  return [
    ...duplicates(b.attendees.map((a) => a.id)).map((i) =>
      err('duplicate_attendee', `attendees.${i}.id`, 'This person has been added twice. Please remove the duplicate entry.'),
    ),
    ...duplicates(b.familyPasses.map((p) => p.id)).map((i) =>
      err('duplicate_pass', `familyPasses.${i}.id`, 'This Family Pass has been added twice. Please remove the duplicate.'),
    ),
  ];
}

// D7: the booker is always 18+, and if attending they are attendee #1.
function bookerRules(b: BookingRequest): RuleError[] {
  const underage = b.booker.age < BOOKER_MIN_AGE
    ? [err('booker_too_young', 'booker.age', `The person booking needs to be ${BOOKER_MIN_AGE} or over. Please ask a parent or guardian to make the booking.`)]
    : [];
  const first = b.attendees[0];
  if (!b.booker.attending || !first) return underage;
  return [
    ...underage,
    ...(sameName(first.name, b.booker.name)
      ? []
      : [err('booker_name_mismatch', 'attendees.0.name', 'You said you are attending, so the first person listed should be you. Please use the same name as in your details, or untick "I\'m attending".')]),
    ...(first.age === b.booker.age
      ? []
      : [err('booker_age_mismatch', 'attendees.0.age', 'You said you are attending, so the first person listed should be you. Please use the same age as in your details, or untick "I\'m attending".')]),
  ];
}

function ticketRules(b: BookingRequest): RuleError[] {
  return b.attendees.flatMap((a, i): RuleError[] => {
    const path = `attendees.${i}.ticket`;
    const band = ageBand(a.age);
    const t = a.ticket;
    if (t.kind === 'none') {
      return band === 'toddler'
        ? []
        : [err('ticket_required', path, `Everyone aged ${CHILD_MIN_AGE} or over needs a ticket. Please choose one for ${a.name}.`)];
    }
    if (band === 'toddler' && t.kind !== 'family') {
      return [err('toddler_free', path, `${a.name} is under ${CHILD_MIN_AGE}, so they come in free. Please remove the ticket, or add them to a Family Pass.`)];
    }
    if (t.kind === 'day' && t.days.length === 0) {
      return [err('days_required', `${path}.days`, `Please pick at least one day for ${a.name}'s Day Pass.`)];
    }
    if (t.kind === 'family' && !b.familyPasses.some((p) => p.id === t.passId)) {
      return [err('unknown_pass', `${path}.passId`, `${a.name} is on a Family Pass that is no longer in your booking. Please choose another ticket.`)];
    }
    return [];
  });
}

// D2: a pass covers up to 2 adults (12+) and 2 children (5-11), at least 1 adult. Toddlers ride free.
function familyPassRules(b: BookingRequest): RuleError[] {
  return b.familyPasses.flatMap((pass, j): RuleError[] => {
    const path = `familyPasses.${j}`;
    const members = b.attendees.filter((a) => a.ticket.kind === 'family' && a.ticket.passId === pass.id);
    const count = (band: AgeBand) => members.filter((a) => ageBand(a.age) === band).length;
    if (members.length === 0) {
      return [err('family_pass_empty', path, 'This Family Pass has nobody on it. Please add people to it or remove it.')];
    }
    return [
      ...(count('adult') > FAMILY_PASS_MAX_ADULTS
        ? [err('family_too_many_adults', path, `A Family Pass covers up to ${FAMILY_PASS_MAX_ADULTS} adults (${ADULT_MIN_AGE}+). Please add a second pass or move someone to a Day Pass.`)]
        : []),
      ...(count('child') > FAMILY_PASS_MAX_CHILDREN
        ? [err('family_too_many_children', path, `A Family Pass covers up to ${FAMILY_PASS_MAX_CHILDREN} children (${CHILD_MIN_AGE} to ${ADULT_MIN_AGE - 1}). Please add a second pass or move someone to a Day Pass.`)]
        : []),
      ...(count('adult') < 1
        ? [err('family_needs_adult', path, `A Family Pass needs at least one adult (${ADULT_MIN_AGE}+). Please add one or choose Day Passes instead.`)]
        : []),
    ];
  });
}

// D5/D6: dinner and Garba only on days the person has entry.
// Garba minimum age is CHILD_MIN_AGE (5): under-5s are not ticketed, so they do not take workshops.
function extrasRules(b: BookingRequest): RuleError[] {
  return b.attendees.flatMap((a, i): RuleError[] => {
    const entry = entryDays(a, b);
    const noEntry = (kind: string, field: 'dinnerDays' | 'garbaDays', what: string, day: FestivalDay, k: number) =>
      err(kind, `attendees.${i}.${field}.${k}`, `${a.name} does not have entry on ${dayLabel(day)}, so ${what} can't be added for that day. Please add the day to their ticket or remove it.`);
    const dinner = a.dinnerDays.flatMap((d, k) => (entry.includes(d) ? [] : [noEntry('dinner_without_entry', 'dinnerDays', 'a dinner plate', d, k)]));
    if (ageBand(a.age) === 'toddler' && a.garbaDays.length > 0) {
      return [...dinner, err('garba_min_age', `attendees.${i}.garbaDays`, `The Garba workshop is for ages ${CHILD_MIN_AGE} and over, so ${a.name} can't join it.`)];
    }
    const garba = a.garbaDays.flatMap((d, k) => (entry.includes(d) ? [] : [noEntry('garba_without_entry', 'garbaDays', 'the Garba workshop', d, k)]));
    return [...dinner, ...garba];
  });
}

// D8: anyone under 12 needs an 18+ in the group. (This also rules out an all-toddler group,
// so there is no separate "at least one ticket holder" rule.)
function groupRules(b: BookingRequest): RuleError[] {
  const hasMinor = b.attendees.some((a) => a.age < ADULT_MIN_AGE);
  const hasGrownUp = b.attendees.some((a) => a.age >= BOOKER_MIN_AGE);
  return hasMinor && !hasGrownUp
    ? [err('needs_adult_supervisor', 'attendees', `Children under ${ADULT_MIN_AGE} need a grown-up aged ${BOOKER_MIN_AGE} or over in the group. Please add one.`)]
    : [];
}

const RULES: readonly ((b: BookingRequest) => RuleError[])[] = [
  identityRules,
  bookerRules,
  ticketRules,
  familyPassRules,
  extrasRules,
  groupRules,
];

/** The only door to a ValidBooking: the brand is granted when no rule produced an error. */
function isValid(b: BookingRequest, errors: readonly RuleError[]): b is ValidBooking {
  return errors.length === 0;
}

export function validateBooking(input: unknown): Result<ValidBooking, RuleError[]> {
  const parsed = bookingRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodErrorToRuleErrors(parsed.error) };
  const booking: BookingRequest = parsed.data;
  const errors = RULES.flatMap((rule) => rule(booking));
  return isValid(booking, errors) ? { ok: true, value: booking } : { ok: false, error: errors };
}
