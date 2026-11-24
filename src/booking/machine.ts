// The whole booking flow as one pure reducer. No fetch, no clock, no randomness: ids and keys
// arrive inside actions, so every transition is testable. The payable total is never computed here.
import type { BookingResult, CatalogView } from '../api/schemas';
import type { Quote, RuleError } from '../domain/types';
import type { BookingAction } from './actions';
import { reduceDraft } from './draftReducer';
import {
  BOOKER_ID,
  FORM_STEPS,
  ageProblem,
  buildRequest,
  describeTicket,
  emptyPerson,
  errorsUpTo,
  personLabel,
  requestKey,
  stepIndex,
  stepOfPath,
  uniqueMessages,
  type Draft,
  type FormStep,
  type QuoteStatus,
  type StepId,
} from './model';

export type { BookingAction } from './actions';

export interface StepNotice {
  readonly tone: 'warning' | 'error';
  readonly title: string;
  readonly text: string;
}

export type SubmitState =
  | { readonly status: 'idle' }
  | { readonly status: 'inflight' }
  /** Declined or not-accepted card: stay on review, focus the card field. */
  | { readonly status: 'card'; readonly message: string }
  | { readonly status: 'offline' }
  | { readonly status: 'failed'; readonly message: string };

export type CatalogState =
  | { readonly status: 'loading' }
  | { readonly status: 'offline' | 'error' }
  | { readonly status: 'ready'; readonly catalog: CatalogView };

export interface ConfirmationView {
  readonly reference: string;
  readonly amountCents: number;
  readonly quote: Quote;
  readonly bookerName: string;
  readonly email: string;
  readonly people: readonly { readonly name: string; readonly ticket: string }[];
}

export interface BookingState {
  readonly step: StepId;
  readonly draft: Draft;
  readonly cardNumber: string;
  readonly quote: Quote | null;
  readonly quoteStatus: QuoteStatus;
  /** Bumped to force a fresh quote when the draft itself did not change. */
  readonly quoteNonce: number;
  readonly fieldErrors: readonly RuleError[];
  /** A step shows its field errors only once the person has tried to leave it. */
  readonly attempted: Readonly<Record<FormStep, boolean>>;
  /** Bumped on every blocked attempt so the UI can move focus to the first problem. */
  readonly attemptNonce: number;
  readonly idempotencyKey: string | null;
  readonly submit: SubmitState;
  readonly notice: StepNotice | null;
  readonly confirmation: ConfirmationView | null;
  readonly catalog: CatalogState;
}

const NOT_ATTEMPTED: BookingState['attempted'] = { group: false, tickets: false, extras: false, review: false };

export function initialState(): BookingState {
  const booker = { name: '', email: '', phone: '', ageInput: '', age: null, attending: true };
  return {
    step: 'group',
    draft: {
      booker,
      people: [emptyPerson(BOOKER_ID)],
      passes: [],
      dandiyaQty: 0,
      promoCode: '',
    },
    cardNumber: '',
    quote: null,
    quoteStatus: 'idle',
    quoteNonce: 0,
    fieldErrors: [],
    attempted: NOT_ATTEMPTED,
    attemptNonce: 0,
    idempotencyKey: null,
    submit: { status: 'idle' },
    notice: null,
    confirmation: null,
    catalog: { status: 'loading' },
  };
}

// ---------- moving on ----------

export type AdvanceCheck =
  | { readonly kind: 'ok' }
  | { readonly kind: 'wait' }
  | { readonly kind: 'blocked'; readonly messages: readonly string[] };

const UNVERIFIED = "We can't check your booking right now. Please check your connection and try again.";

function groupValidationMessages(draft: Draft): string[] {
  const msgs: string[] = [];
  if (draft.booker.name.trim() === '') msgs.push('Your name: Please enter your name.');
  const emailVal = draft.booker.email.trim();
  if (emailVal === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
    msgs.push('Email: Please enter a valid email address.');
  }
  const phoneVal = draft.booker.phone.trim();
  if (
    phoneVal === '' ||
    !/^[0-9 +\-()]{7,20}$/.test(phoneVal) ||
    (phoneVal.match(/\d/g) ?? []).length < 7
  ) {
    msgs.push('Phone: Enter a valid phone number.');
  }
  const ownAge = ageProblem(draft.booker.ageInput);
  if (ownAge !== null) msgs.push(`Your age: ${ownAge}`);
  for (let i = 0; i < draft.people.length; i++) {
    const p = draft.people[i];
    if (p.id !== BOOKER_ID) {
      if (p.name.trim() === '') msgs.push(`${personLabel(p, i)}'s name: Please enter a name.`);
      const pAge = ageProblem(p.ageInput);
      if (pAge !== null) msgs.push(`${personLabel(p, i)}'s age: ${pAge}`);
    }
  }
  return msgs;
}

function ageMessages(draft: Draft): string[] {
  const own = ageProblem(draft.booker.ageInput);
  const booker = own === null ? [] : [`Your age: ${own}`];
  const others = draft.people.flatMap((p, i) => {
    const problem = p.id === BOOKER_ID ? null : ageProblem(p.ageInput);
    return problem === null ? [] : [`${personLabel(p, i)}'s age: ${problem}`];
  });
  return [...booker, ...others];
}

/** Can the person leave the current step? Answers from the last server quote, never from the browser's own rules. */
export function advanceCheck(state: BookingState): AdvanceCheck {
  if (!isFormStep(state.step)) return { kind: 'ok' };
  if (state.step === 'group') {
    const groupMsgs = groupValidationMessages(state.draft);
    if (groupMsgs.length > 0) return { kind: 'blocked', messages: groupMsgs };
  }
  if (buildRequest(state.draft) === null) return { kind: 'blocked', messages: ageMessages(state.draft) };
  if (state.quoteStatus === 'loading' || state.quoteStatus === 'idle') return { kind: 'wait' };
  if (state.quoteStatus !== 'ready') return { kind: 'blocked', messages: [UNVERIFIED] };
  const errors = errorsUpTo(state.fieldErrors, state.step);
  return errors.length === 0 ? { kind: 'ok' } : { kind: 'blocked', messages: uniqueMessages(errors) };
}

const isFormStep = (step: StepId): step is FormStep => step !== 'paying' && step !== 'confirmed';

const earliestStep = (errors: readonly RuleError[]): FormStep | null =>
  errors.reduce<FormStep | null>((best, e) => {
    const step = stepOfPath(e.path);
    return best === null || stepIndex(step) < stepIndex(best) ? step : best;
  }, null);

// ---------- draft edits ----------

const quoteStatusFor = (draft: Draft): QuoteStatus => (buildRequest(draft) === null ? 'idle' : 'loading');

function withDraft(state: BookingState, draft: Draft): BookingState {
  if (requestKey(draft) === requestKey(state.draft)) return { ...state, draft };
  const askable = buildRequest(draft) !== null;
  return {
    ...state,
    draft,
    idempotencyKey: null,
    submit: state.submit.status === 'inflight' ? state.submit : { status: 'idle' },
    quoteStatus: quoteStatusFor(draft),
    quote: askable ? state.quote : null,
    fieldErrors: askable ? state.fieldErrors : [],
  };
}

// ---------- paying ----------

const NO_CARD = 'Please enter your card number to pay.';
const RETRY = 'Something went wrong. Nothing has been charged. Please try again.';

function startPay(state: BookingState): BookingState {
  const { quote } = state;
  const ready =
    state.step === 'review' &&
    state.submit.status !== 'inflight' &&
    state.idempotencyKey !== null &&
    state.quoteStatus === 'ready' &&
    quote !== null &&
    state.fieldErrors.length === 0 &&
    buildRequest(state.draft) !== null;
  if (!ready) return state;
  if (quote.totalCents > 0 && state.cardNumber.trim() === '') return { ...state, submit: { status: 'card', message: NO_CARD } };
  return { ...state, step: 'paying', submit: { status: 'inflight' }, notice: null };
}

const refreshed = (state: BookingState): BookingState => ({
  ...state,
  quote: null,
  quoteNonce: state.quoteNonce + 1,
  quoteStatus: quoteStatusFor(state.draft),
});

function sendBackTo(state: BookingState, step: FormStep, notice: StepNotice, fields: readonly RuleError[]): BookingState {
  return {
    ...refreshed(state),
    step,
    fieldErrors: fields,
    attempted: { ...state.attempted, [step]: true },
    attemptNonce: state.attemptNonce + 1,
    submit: { status: 'idle' },
    notice,
  };
}

function rejectPay(state: BookingState, a: Extract<BookingAction, { type: 'payRejected' }>): BookingState {
  const back: BookingState = { ...state, step: 'review', submit: { status: 'idle' } };
  if (a.status === 402 || a.code === 'PAYMENT_INVALID') return { ...back, submit: { status: 'card', message: a.message } };
  const step = earliestStep(a.fields);
  if (a.status === 409 && a.code === 'SOLD_OUT') {
    return sendBackTo(state, step ?? 'tickets', { tone: 'warning', title: 'Some items just sold out', text: a.message }, a.fields);
  }
  if (a.status === 422 && a.code === 'INVALID_BOOKING' && step !== null) {
    return sendBackTo(state, step, { tone: 'error', title: 'Some details need fixing', text: a.message }, a.fields);
  }
  if (a.code === 'IDEMPOTENCY_KEY_REUSED') return { ...back, idempotencyKey: null, submit: { status: 'failed', message: RETRY } };
  if (a.status === 409) return { ...refreshed(back), submit: { status: 'failed', message: a.message } };
  return { ...back, submit: { status: 'failed', message: a.message || RETRY } };
}

function confirm(state: BookingState, result: BookingResult): BookingState {
  const { draft } = state;
  return {
    ...state,
    step: 'confirmed',
    cardNumber: '',
    submit: { status: 'idle' },
    notice: null,
    confirmation: {
      reference: result.reference,
      amountCents: result.amountCents,
      quote: result.quote,
      bookerName: draft.booker.name.trim(),
      email: draft.booker.email.trim(),
      people: draft.people.map((p, i) => ({ name: personLabel(p, i), ticket: describeTicket(p, draft.passes) })),
    },
  };
}

// ---------- the reducer ----------

function navigate(state: BookingState, direction: 1 | -1): BookingState {
  if (!isFormStep(state.step)) return state;
  const target = FORM_STEPS[stepIndex(state.step) + direction];
  if (target === undefined) return state;
  if (direction === -1) return { ...state, step: target, notice: null };
  const check = advanceCheck(state);
  if (check.kind === 'wait') return state;
  if (check.kind === 'blocked') {
    return { ...state, attempted: { ...state.attempted, [state.step]: true }, attemptNonce: state.attemptNonce + 1 };
  }
  return { ...state, step: target, notice: null };
}

export function bookingReducer(state: BookingState, action: BookingAction): BookingState {
  const draft = reduceDraft(state.draft, action);
  if (draft !== state.draft) return withDraft(state, draft);

  switch (action.type) {
    case 'cardEdited':
      return { ...state, cardNumber: action.value, submit: state.submit.status === 'card' ? { status: 'idle' } : state.submit };
    case 'nextClicked':
      return navigate(state, 1);
    case 'backClicked':
      return navigate(state, -1);
    case 'keyIssued':
      return state.idempotencyKey === null ? { ...state, idempotencyKey: action.key } : state;
    case 'startedOver':
      return { ...initialState(), catalog: state.catalog };
    case 'quoteLoaded':
      return { ...state, quote: action.quote, quoteStatus: 'ready', fieldErrors: [] };
    case 'quoteRejected':
      return { ...state, quote: null, quoteStatus: 'ready', fieldErrors: action.errors };
    case 'quoteUnavailable':
      return { ...state, quoteStatus: action.offline ? 'offline' : 'error' };
    case 'quoteRefreshRequested':
      return { ...state, quoteNonce: state.quoteNonce + 1, quoteStatus: quoteStatusFor(state.draft) };
    case 'catalogLoaded':
      return { ...state, catalog: { status: 'ready', catalog: action.catalog } };
    case 'catalogUnavailable':
      return { ...state, catalog: state.catalog.status === 'ready' ? state.catalog : { status: action.offline ? 'offline' : 'error' } };
    case 'payStarted':
      return startPay(state);
    case 'payConfirmed':
      return confirm(state, action.result);
    case 'payRejected':
      return rejectPay(state, action);
    case 'payOffline':
      return { ...state, step: 'review', submit: { status: 'offline' } };
    case 'payFailed':
      return { ...state, step: 'review', submit: { status: 'failed', message: action.message } };
    case 'confirmationRestored':
      return {
        ...state,
        step: 'confirmed',
        confirmation: {
          reference: action.saved.reference,
          amountCents: action.saved.quote.totalCents,
          quote: action.saved.quote,
          bookerName: action.saved.booker.name,
          email: action.saved.booker.email,
          people: action.saved.attendees,
        },
      };
    default:
      return state;
  }
}
