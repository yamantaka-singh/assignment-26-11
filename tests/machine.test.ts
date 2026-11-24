import { describe, expect, it } from 'vite-plus/test';
import { advanceCheck, bookingReducer, initialState, type BookingAction, type BookingState } from '../src/booking/machine';
import { buildRequest, entryDaysOf, parseAge, stepOfPath } from '../src/booking/model';
import type { Quote } from '../src/domain/types';

const run = (actions: readonly BookingAction[], from: BookingState = initialState()): BookingState =>
  actions.reduce(bookingReducer, from);

const D10 = '2026-11-10';
const D11 = '2026-11-11';
const D12 = '2026-11-12';

const bookerActions: BookingAction[] = [
  { type: 'bookerEdited', field: 'name', value: 'Meera Shah' },
  { type: 'bookerEdited', field: 'email', value: 'meera@example.com' },
  { type: 'bookerEdited', field: 'phone', value: '214-555-0101' },
  { type: 'bookerEdited', field: 'age', value: '38' },
];

const addPerson = (id: string, name: string, age: string): BookingAction[] => [
  { type: 'personAdded', id },
  { type: 'personEdited', id, field: 'name', value: name },
  { type: 'personEdited', id, field: 'age', value: age },
];

const person = (state: BookingState, id: string) => {
  const found = state.draft.people.find((p) => p.id === id);
  if (!found) throw new Error(`no person ${id}`);
  return found;
};

const quote: Quote = {
  lines: [],
  subtotalCents: 1500,
  discountCents: 0,
  totalCents: 1500,
  promo: { status: 'none' },
  hints: [],
  stockNeeded: {},
};

describe('age text', () => {
  it.each([
    ['1', 1],
    ['12', 12],
    [' 7 ', 7],
    ['120', 120],
    ['007', 7],
  ])('parses %j as %i', (text, age) => expect(parseAge(text)).toBe(age));

  it.each(['', '12abc', '-1', '3.5', '121', '1e1', '٣'])('rejects %j', (text) => expect(parseAge(text)).toBeNull());

  it('keeps what was typed while the parsed age follows it', () => {
    const s = run([...addPerson('p1', 'Kid', '1'), { type: 'personEdited', id: 'p1', field: 'age', value: '12' }]);
    expect(person(s, 'p1')).toMatchObject({ ageInput: '12', age: 12 });
  });

  it('keeps invalid text, has no age, and builds no request', () => {
    const s = run([...bookerActions, ...addPerson('p1', 'Kid', '12abc')]);
    expect(person(s, 'p1')).toMatchObject({ ageInput: '12abc', age: null });
    expect(buildRequest(s.draft)).toBeNull();
  });
});

describe('the booker as attendee', () => {
  it('starts attending: attendee #0 is the booker', () => {
    const s = initialState();
    expect(s.draft.booker.attending).toBe(true);
    expect(s.draft.people[0]?.id).toBe('booker');
  });

  it('mirrors the booker name and age onto attendee #0', () => {
    const s = run(bookerActions);
    expect(person(s, 'booker')).toMatchObject({ name: 'Meera Shah', ageInput: '38', age: 38 });
  });

  it('un-ticking removes them and their extras; ticking puts them first again', () => {
    const base = run([
      ...bookerActions,
      { type: 'ticketKindChosen', personId: 'booker', kind: 'allDay' },
      { type: 'dinnerDaysChosen', personId: 'booker', days: [D10] },
      ...addPerson('p1', 'Asha', '40'),
    ]);
    const off = run([{ type: 'attendingToggled', attending: false }], base);
    expect(off.draft.people.map((p) => p.id)).toEqual(['p1']);
    const on = run([{ type: 'attendingToggled', attending: true }], off);
    expect(on.draft.people.map((p) => p.id)).toEqual(['booker', 'p1']);
    expect(person(on, 'booker')).toMatchObject({ name: 'Meera Shah', age: 38, ticket: { kind: 'none' }, dinnerDays: [] });
  });
});

describe('age changes and tickets', () => {
  const withTicket = run([
    ...bookerActions,
    ...addPerson('p1', 'Ravi', '30'),
    { type: 'ticketKindChosen', personId: 'p1', kind: 'day' },
    { type: 'dayPassDaysChosen', personId: 'p1', days: [D10, D11] },
    { type: 'dinnerDaysChosen', personId: 'p1', days: [D10, D11] },
    { type: 'garbaDaysChosen', personId: 'p1', days: [D11] },
  ]);

  it('keeps the ticket when the age stays in the same band', () => {
    const s = run([{ type: 'personEdited', id: 'p1', field: 'age', value: '45' }], withTicket);
    expect(person(s, 'p1').ticket).toEqual({ kind: 'day', days: [D10, D11] });
  });

  it('clears the ticket and extras when the band changes (adult -> 6 year old)', () => {
    const s = run([{ type: 'personEdited', id: 'p1', field: 'age', value: '6' }], withTicket);
    expect(person(s, 'p1')).toMatchObject({ ticket: { kind: 'none' }, dinnerDays: [], garbaDays: [] });
  });

  it('clears a toddler ticket and garba when someone becomes under 5', () => {
    const s = run([{ type: 'personEdited', id: 'p1', field: 'age', value: '3' }], withTicket);
    expect(person(s, 'p1')).toMatchObject({ ticket: { kind: 'none' }, garbaDays: [] });
  });

  it('clears the ticket while the age text is not a number', () => {
    const s = run([{ type: 'personEdited', id: 'p1', field: 'age', value: '3x' }], withTicket);
    expect(person(s, 'p1')).toMatchObject({ age: null, ticket: { kind: 'none' } });
  });

  it('prunes dinner and garba days the ticket no longer covers', () => {
    const s = run([{ type: 'dayPassDaysChosen', personId: 'p1', days: [D10] }], withTicket);
    expect(person(s, 'p1')).toMatchObject({ dinnerDays: [D10], garbaDays: [] });
  });

  it('lets a toddler eat on days the family has entry', () => {
    const s = run([...addPerson('t1', 'Baby', '3')], withTicket);
    expect(entryDaysOf(s.draft, 't1')).toEqual([D10, D11]);
    const dinner = run([{ type: 'dinnerDaysChosen', personId: 't1', days: [D10, D12] }], s);
    expect(person(dinner, 't1').dinnerDays).toEqual([D10]);
  });
});

describe('family passes', () => {
  const family = run([
    ...bookerActions,
    ...addPerson('a2', 'Asha', '36'),
    ...addPerson('c1', 'Kid', '9'),
    { type: 'passAdded', id: 'pass1', day: D12, personId: 'booker' },
    { type: 'passJoined', personId: 'a2', passId: 'pass1' },
    { type: 'passJoined', personId: 'c1', passId: 'pass1' },
    { type: 'dinnerDaysChosen', personId: 'c1', days: [D12] },
  ]);

  it('puts members on the pass', () => {
    expect(family.draft.passes).toEqual([{ id: 'pass1', day: D12 }]);
    expect(person(family, 'c1').ticket).toEqual({ kind: 'family', passId: 'pass1' });
  });

  it('removing a member removes their extras but keeps the pass for the others', () => {
    const s = run([{ type: 'personRemoved', id: 'c1' }], family);
    expect(s.draft.passes).toHaveLength(1);
    expect(s.draft.people.map((p) => p.id)).toEqual(['booker', 'a2']);
  });

  it('removing the last member removes the pass', () => {
    const s = run(
      [
        { type: 'personRemoved', id: 'c1' },
        { type: 'personRemoved', id: 'a2' },
        { type: 'attendingToggled', attending: false },
      ],
      family,
    );
    expect(s.draft.passes).toEqual([]);
  });

  it('moving the last member to another ticket removes the pass', () => {
    const solo = run([
      ...bookerActions,
      { type: 'passAdded', id: 'p', day: D10, personId: 'booker' },
      { type: 'ticketKindChosen', personId: 'booker', kind: 'allDay' },
    ]);
    expect(solo.draft.passes).toEqual([]);
  });

  it('refuses a third adult on one pass (the state does not change)', () => {
    const three = run([...addPerson('a3', 'Third', '50')], family);
    expect(run([{ type: 'passJoined', personId: 'a3', passId: 'pass1' }], three)).toBe(three);
  });

  it('refuses a third child on one pass', () => {
    const kids = run([...addPerson('c2', 'K2', '8'), ...addPerson('c3', 'K3', '7')], family);
    const full = run([{ type: 'passJoined', personId: 'c2', passId: 'pass1' }], kids);
    expect(run([{ type: 'passJoined', personId: 'c3', passId: 'pass1' }], full)).toBe(full);
  });

  it('a change of band takes the person off the pass', () => {
    const s = run([{ type: 'personEdited', id: 'c1', field: 'age', value: '14' }], family);
    expect(person(s, 'c1').ticket).toEqual({ kind: 'none' });
    expect(s.draft.passes).toHaveLength(1);
  });

  it('changing a pass day prunes extras that fall outside it', () => {
    const s = run([{ type: 'passDayChosen', passId: 'pass1', day: D10 }], family);
    expect(person(s, 'c1').dinnerDays).toEqual([]);
  });
});

describe('idempotency key', () => {
  const inReview = run([...bookerActions, { type: 'keyIssued', key: 'key-one-1234' }]);

  it('is kept across card edits, going back and retrying', () => {
    const s = run([{ type: 'cardEdited', value: '4242' }, { type: 'backClicked' }], inReview);
    expect(s.idempotencyKey).toBe('key-one-1234');
  });

  it('is not replaced by a second issue while one exists', () => {
    expect(run([{ type: 'keyIssued', key: 'key-two-5678' }], inReview).idempotencyKey).toBe('key-one-1234');
  });

  it('is dropped when the booking changes, so the next issue is a new key', () => {
    const changed = run([{ type: 'bookerEdited', field: 'email', value: 'other@example.com' }], inReview);
    expect(changed.idempotencyKey).toBeNull();
    expect(run([{ type: 'keyIssued', key: 'key-two-5678' }], changed).idempotencyKey).toBe('key-two-5678');
  });
});

describe('quote state', () => {
  it('marks the quote loading when the request changes, not when it is identical', () => {
    const s = run(bookerActions);
    expect(s.quoteStatus).toBe('loading');
    const ready = run([{ type: 'quoteLoaded', quote }], s);
    expect(run([{ type: 'bookerEdited', field: 'age', value: '038' }], ready).quoteStatus).toBe('ready');
  });

  it('keeps server errors and drops the quote when the server rejects the draft', () => {
    const s = run([
      ...bookerActions,
      { type: 'quoteLoaded', quote },
      { type: 'quoteRejected', errors: [{ code: 'x', path: 'booker.email', message: 'Bad email' }] },
    ]);
    expect(s.quote).toBeNull();
    expect(s.quoteStatus).toBe('ready');
    expect(s.fieldErrors).toHaveLength(1);
  });
});

describe('error paths belong to a step', () => {
  it.each([
    ['booker.email', 'group'],
    ['attendees', 'group'],
    ['attendees.2.age', 'group'],
    ['attendees.2.ticket', 'tickets'],
    ['attendees.2.ticket.days', 'tickets'],
    ['familyPasses.0', 'tickets'],
    ['attendees.1.dinnerDays.0', 'extras'],
    ['attendees.1.garbaDays', 'extras'],
    ['dandiyaQty', 'extras'],
    ['stock.allday-adult', 'tickets'],
    ['stock.garba', 'extras'],
    ['promoCode', 'review'],
  ])('%s -> %s', (path, step) => expect(stepOfPath(path)).toBe(step));
});

describe('moving between steps', () => {
  const ready = (errors: { path: string; message: string }[]) =>
    run([
      ...bookerActions,
      errors.length === 0
        ? { type: 'quoteLoaded', quote }
        : { type: 'quoteRejected', errors: errors.map((e) => ({ code: 'x', ...e })) },
    ]);

  it('waits while the quote is loading', () => {
    expect(advanceCheck(run(bookerActions)).kind).toBe('wait');
  });

  it('blocks on an age that is not a number', () => {
    const s = run([...bookerActions, ...addPerson('p1', 'Kid', '12abc')]);
    const check = advanceCheck(s);
    expect(check.kind).toBe('blocked');
  });

  it('blocks on server errors for this step and earlier, and ignores later ones', () => {
    expect(advanceCheck(ready([{ path: 'booker.email', message: 'Bad email' }])).kind).toBe('blocked');
    expect(advanceCheck(ready([{ path: 'attendees.0.ticket', message: 'Pick one' }])).kind).toBe('ok');
  });

  it('blocks when the quote could not be fetched', () => {
    const s = run([...bookerActions, { type: 'quoteUnavailable', offline: true }]);
    expect(advanceCheck(s).kind).toBe('blocked');
  });

  it('nextClicked advances only when the check passes, and marks the step attempted when it does not', () => {
    const blocked = run([{ type: 'nextClicked' }], ready([{ path: 'booker.email', message: 'Bad email' }]));
    expect(blocked.step).toBe('group');
    expect(blocked.attempted.group).toBe(true);
    const ok = run([{ type: 'nextClicked' }], ready([]));
    expect(ok.step).toBe('tickets');
  });

  it('back goes to the previous step and never past the first', () => {
    const s = run([{ type: 'nextClicked' }, { type: 'backClicked' }, { type: 'backClicked' }], ready([]));
    expect(s.step).toBe('group');
  });
});

describe('paying', () => {
  const toReview = (): BookingState => {
    const s = run([...bookerActions, { type: 'quoteLoaded', quote }, { type: 'nextClicked' }, { type: 'nextClicked' }, { type: 'nextClicked' }]);
    return run([{ type: 'keyIssued', key: 'key-one-1234' }, { type: 'cardEdited', value: '4242 4242 4242 4242' }], s);
  };

  it('starts a payment once: a second start while in flight changes nothing', () => {
    const inflight = run([{ type: 'payStarted' }], toReview());
    expect(inflight.step).toBe('paying');
    expect(inflight.submit.status).toBe('inflight');
    expect(run([{ type: 'payStarted' }], inflight)).toBe(inflight);
  });

  it('does not start without a key or a ready quote', () => {
    const noKey = run([...bookerActions, { type: 'quoteLoaded', quote }, { type: 'nextClicked' }, { type: 'nextClicked' }, { type: 'nextClicked' }]);
    expect(run([{ type: 'payStarted' }], noKey)).toBe(noKey);
  });

  it('a decline stays on review, keeps the key and says so', () => {
    const s = run([{ type: 'payStarted' }, { type: 'payRejected', status: 402, code: 'PAYMENT_DECLINED', message: 'Declined', fields: [] }], toReview());
    expect(s.step).toBe('review');
    expect(s.submit).toEqual({ status: 'card', message: 'Declined' });
    expect(s.idempotencyKey).toBe('key-one-1234');
  });

  it('losing the network keeps the key so Retry replays the same booking', () => {
    const s = run([{ type: 'payStarted' }, { type: 'payOffline' }], toReview());
    expect(s.step).toBe('review');
    expect(s.submit.status).toBe('offline');
    expect(s.idempotencyKey).toBe('key-one-1234');
    expect(run([{ type: 'payStarted' }], s).submit.status).toBe('inflight');
  });

  it('sold out sends the person back to the step that holds the item and refreshes the quote', () => {
    const s = run(
      [
        { type: 'payStarted' },
        {
          type: 'payRejected',
          status: 409,
          code: 'SOLD_OUT',
          message: 'Garba is sold out.',
          fields: [{ code: 'SOLD_OUT', path: 'stock.garba', message: 'Garba is sold out.' }],
        },
      ],
      toReview(),
    );
    expect(s.step).toBe('extras');
    expect(s.notice?.text).toContain('Garba');
    expect(s.quoteStatus).toBe('loading');
    expect(s.attempted.extras).toBe(true);
  });

  it('field errors from a 422 send the person to the earliest step with a problem', () => {
    const s = run(
      [
        { type: 'payStarted' },
        {
          type: 'payRejected',
          status: 422,
          code: 'INVALID_BOOKING',
          message: 'Fix',
          fields: [
            { code: 'x', path: 'attendees.0.ticket', message: 'Pick one' },
            { code: 'x', path: 'booker.phone', message: 'Bad phone' },
          ],
        },
      ],
      toReview(),
    );
    expect(s.step).toBe('group');
    expect(s.fieldErrors).toHaveLength(2);
  });

  it('a confirmed booking (including a replay) shows the confirmation and forgets the card', () => {
    const s = run(
      [{ type: 'payStarted' }, { type: 'payConfirmed', result: { bookingId: 'b1', reference: 'SU-ABC', amountCents: 1500, quote } }],
      toReview(),
    );
    expect(s.step).toBe('confirmed');
    expect(s.cardNumber).toBe('');
    expect(s.confirmation?.reference).toBe('SU-ABC');
  });
});

describe('people count', () => {
  it('never allows more than 20 people', () => {
    const ids = Array.from({ length: 25 }, (_, i): BookingAction => ({ type: 'personAdded', id: `p${i}` }));
    expect(run(ids).draft.people).toHaveLength(20);
  });

  it('clamps dandiya to 0..20', () => {
    expect(run([{ type: 'dandiyaChosen', qty: 99 }]).draft.dandiyaQty).toBe(20);
    expect(run([{ type: 'dandiyaChosen', qty: -3 }]).draft.dandiyaQty).toBe(0);
  });
});
