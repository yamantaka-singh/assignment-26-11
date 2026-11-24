// Every edit to the booking draft. Returns the same object when an action is not a draft edit or
// changes nothing, so the caller can tell by identity. All results go through normalizeDraft.
import {
  GARBA_DAYS,
  MAX_ATTENDEES,
  MAX_DANDIYA,
} from '../domain/catalog';
import { MAX_FAMILY_PASSES } from '../domain/schema';
import type { BookingAction } from './actions';
import {
  BOOKER_ID,
  NO_TICKET,
  bandOf,
  emptyPerson,
  hasRoom,
  normalizeDraft,
  parseAge,
  sortDays,
  withAgeInput,
  type BookerDraft,
  type Draft,
  type Person,
} from './model';

const mapPerson = (draft: Draft, id: string, change: (p: Person) => Person): Draft => {
  if (!draft.people.some((p) => p.id === id)) return draft;
  return { ...draft, people: draft.people.map((p) => (p.id === id ? change(p) : p)) };
};

const isTicketed = (p: Person): boolean => bandOf(p.age) === 'child' || bandOf(p.age) === 'adult';

function bookerWith(booker: BookerDraft, field: 'name' | 'email' | 'phone' | 'age', value: string): BookerDraft {
  switch (field) {
    case 'name':
      return { ...booker, name: value };
    case 'email':
      return { ...booker, email: value };
    case 'phone':
      return { ...booker, phone: value };
    case 'age':
      return { ...booker, ageInput: value, age: parseAge(value) };
  }
}

function editBooker(draft: Draft, field: 'name' | 'email' | 'phone' | 'age', value: string): Draft {
  const booker: BookerDraft = bookerWith(draft.booker, field, value);
  const synced = draft.booker.attending && (field === 'name' || field === 'age');
  const withBooker = { ...draft, booker };
  if (!synced) return withBooker;
  return mapPerson(withBooker, BOOKER_ID, (p) => (field === 'name' ? { ...p, name: value } : withAgeInput(p, value)));
}

function toggleAttending(draft: Draft, attending: boolean): Draft {
  const booker = { ...draft.booker, attending };
  const others = draft.people.filter((p) => p.id !== BOOKER_ID);
  if (!attending) return { ...draft, booker, people: others };
  if (others.length >= MAX_ATTENDEES) return draft;
  const me = withAgeInput({ ...emptyPerson(BOOKER_ID), name: booker.name }, booker.ageInput);
  return { ...draft, booker, people: [me, ...others] };
}

function joinPass(draft: Draft, personId: string, passId: string): Draft {
  const person = draft.people.find((p) => p.id === personId);
  if (!person || !draft.passes.some((x) => x.id === passId) || !hasRoom(draft, person, passId)) return draft;
  return mapPerson(draft, personId, (p) => ({ ...p, ticket: { kind: 'family', passId } }));
}

function chooseKind(draft: Draft, personId: string, kind: 'day' | 'allDay'): Draft {
  return mapPerson(draft, personId, (p) => {
    if (!isTicketed(p)) return p;
    if (kind === 'allDay') return { ...p, ticket: { kind: 'allDay' } };
    return p.ticket.kind === 'day' ? p : { ...p, ticket: { kind: 'day', days: [] } };
  });
}

function edit(draft: Draft, action: BookingAction): Draft {
  switch (action.type) {
    case 'bookerEdited':
      return editBooker(draft, action.field, action.value);
    case 'attendingToggled':
      return draft.booker.attending === action.attending ? draft : toggleAttending(draft, action.attending);
    case 'personAdded':
      return draft.people.length >= MAX_ATTENDEES || draft.people.some((p) => p.id === action.id)
        ? draft
        : { ...draft, people: [...draft.people, emptyPerson(action.id)] };
    case 'personRemoved':
      return action.id === BOOKER_ID ? draft : { ...draft, people: draft.people.filter((p) => p.id !== action.id) };
    case 'personEdited':
      return action.id === BOOKER_ID
        ? draft
        : mapPerson(draft, action.id, (p) => (action.field === 'name' ? { ...p, name: action.value } : withAgeInput(p, action.value)));
    case 'ticketKindChosen':
      return chooseKind(draft, action.personId, action.kind);
    case 'dayPassDaysChosen':
      return mapPerson(draft, action.personId, (p) =>
        p.ticket.kind === 'day' ? { ...p, ticket: { kind: 'day', days: sortDays(action.days) } } : p,
      );
    case 'passAdded': {
      if (draft.passes.length >= MAX_FAMILY_PASSES || draft.passes.some((x) => x.id === action.id)) return draft;
      const withPass = { ...draft, passes: [...draft.passes, { id: action.id, day: action.day }] };
      return action.personId === undefined ? withPass : joinPass(withPass, action.personId, action.id);
    }
    case 'passJoined':
      return joinPass(draft, action.personId, action.passId);
    case 'passDayChosen':
      return { ...draft, passes: draft.passes.map((x) => (x.id === action.passId ? { ...x, day: action.day } : x)) };
    case 'passRemoved':
      return {
        ...draft,
        passes: draft.passes.filter((x) => x.id !== action.passId),
        people: draft.people.map((p) =>
          p.ticket.kind === 'family' && p.ticket.passId === action.passId ? { ...p, ticket: NO_TICKET } : p,
        ),
      };
    case 'dinnerDaysChosen':
      return mapPerson(draft, action.personId, (p) => ({ ...p, dinnerDays: sortDays(action.days) }));
    case 'garbaDaysChosen':
      return mapPerson(draft, action.personId, (p) => ({ ...p, garbaDays: GARBA_DAYS.filter((d) => action.days.includes(d)) }));
    case 'dandiyaChosen':
      return { ...draft, dandiyaQty: Math.min(MAX_DANDIYA, Math.max(0, Math.trunc(action.qty))) };
    case 'promoApplied':
      return { ...draft, promoCode: action.code.trim() };
    default:
      return draft;
  }
}

export function reduceDraft(draft: Draft, action: BookingAction): Draft {
  const next = edit(draft, action);
  return next === draft ? draft : normalizeDraft(next);
}
