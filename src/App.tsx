import { useEffect, useReducer, useRef } from 'react';
import {
  useCatalogSync,
  useIdempotencyKey,
  usePaymentRequest,
  useQuoteSync,
  useReconnect,
  useRestoredConfirmation,
} from './booking/effects';
import { advanceCheck, bookingReducer, initialState, type BookingState } from './booking/machine';
import { SummaryBar } from './booking/SummaryBar';
import { Confirmation } from './booking/steps/Confirmation';
import { ExtrasStep } from './booking/steps/ExtrasStep';
import { GroupStep } from './booking/steps/GroupStep';
import { ReviewStep } from './booking/steps/ReviewStep';
import { TicketsStep } from './booking/steps/TicketsStep';
import type { StepId } from './booking/model';
import { Button } from './ui/components/Button';
import { FestivalParticles } from './ui/components/FestivalParticles';
import { KrishnaMascot } from './ui/components/KrishnaMascot';
import { MandalaWatermark } from './ui/components/MandalaWatermark';
import { formatCents } from './ui/components/MoneyText';
import { Notice } from './ui/components/Notice';
import { Stepper } from './ui/components/Stepper';

const TITLES: Readonly<Record<StepId, string>> = {
  group: 'Who is coming?',
  tickets: 'Choose tickets',
  extras: 'Add extras',
  review: 'Review and pay',
  paying: 'Review and pay',
  confirmed: "You're booked",
};

const STEPS = [
  { id: 'group', label: 'Group' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'extras', label: 'Extras' },
  { id: 'review', label: 'Pay' },
  { id: 'confirmed', label: 'Done' },
];

const payLabel = (state: BookingState): string =>
  state.quote === null ? 'Pay' : state.quote.totalCents === 0 ? 'Confirm booking' : `Pay ${formatCents(state.quote.totalCents)}`;

export function App() {
  const [state, dispatch] = useReducer(bookingReducer, undefined, initialState);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const shown = state.step === 'paying' ? 'review' : state.step;
  const firstRender = useRef(true);

  useQuoteSync(state, dispatch);
  useCatalogSync(state, dispatch);
  useIdempotencyKey(state, dispatch);
  usePaymentRequest(state, dispatch);
  useRestoredConfirmation(dispatch);
  useReconnect(dispatch);

  // New step: move focus to its heading so keyboard and screen-reader users start at the top of it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [shown]);

  // A blocked "Next": land on the first problem field, or the summary when the problem is not a field.
  useEffect(() => {
    if (state.attemptNonce === 0) return;
    const body = bodyRef.current;
    const target = body?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? body?.querySelector<HTMLElement>('.step-errors');
    target?.focus();
  }, [state.attemptNonce]);

  const isReview = shown === 'review';
  const isConfirmed = shown === 'confirmed';
  const check = advanceCheck(state);
  const attempted = shown !== 'confirmed' && state.attempted[shown];
  const blocked = attempted && check.kind === 'blocked' && !isReview ? check.messages : [];
  // A server notice (e.g. "sold out") already says it; do not repeat it in the summary.
  const messages = blocked.filter((m) => !state.notice?.text.includes(m));
  const stepProps = { state, dispatch, errors: attempted ? state.fieldErrors : [] };
  const onPay = (): void => dispatch({ type: 'payStarted' });
  const inflight = state.submit.status === 'inflight';
  const canPay = state.idempotencyKey !== null && state.quoteStatus === 'ready' && state.quote !== null;

  const startOver = (): void => {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    dispatch({ type: 'startedOver' });
  };

  return (
    <>
      <FestivalParticles />
      <MandalaWatermark position="top-right" />
      <MandalaWatermark position="bottom-left" />
      <main className="page stack">
        <header className="app-header">
          <div className="krishna-avatar-badge" aria-hidden="true">
            <KrishnaMascot pose="flute" size="badge" floating />
          </div>
          <div>
            <h1 className="app-title">Sharad Utsav 2026</h1>
            <p className="muted app-subtitle">Radha Krishna Temple, Allen, Texas · Tue 10 to Sat 14 Nov</p>
          </div>
        </header>
      <Stepper steps={STEPS} currentId={shown} />
      <h2 ref={headingRef} tabIndex={-1} className="step-heading">
        {TITLES[state.step]}
      </h2>

      <div ref={bodyRef} className="stack">
        {state.step !== 'group' && messages.length > 0 ? (
          <div className="step-errors" tabIndex={-1}>
            <Notice tone="error" title={messages.length === 1 ? 'One thing to fix before you continue' : `${messages.length} things to fix before you continue`}>
              <ul className="list-plain">
                {messages.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </Notice>
          </div>
        ) : null}

        {state.step === 'group' || state.step === 'tickets' || state.step === 'extras' ? (
          <form id="step-form" noValidate onSubmit={(e) => { e.preventDefault(); dispatch({ type: 'nextClicked' }); }}>
            {state.step === 'group' ? <GroupStep {...stepProps} /> : state.step === 'tickets' ? <TicketsStep {...stepProps} /> : <ExtrasStep {...stepProps} />}
          </form>
        ) : null}
        {isReview ? <ReviewStep {...stepProps} onPay={onPay} /> : null}
        {isConfirmed && state.confirmation ? <Confirmation confirmation={state.confirmation} onStartOver={startOver} /> : null}
      </div>

      {isConfirmed ? null : (
        <SummaryBar quote={state.quote} status={state.quoteStatus}>
          {state.step !== 'group' && !inflight ? (
            <Button variant="secondary" onClick={() => dispatch({ type: 'backClicked' })}>
              Back
            </Button>
          ) : null}
          {isReview ? (
            <Button type="submit" form="pay-form" loading={inflight} disabled={!canPay}>
              {payLabel(state)}
            </Button>
          ) : (
            <Button type="submit" form="step-form" loading={check.kind === 'wait' && state.quoteStatus === 'loading'}>
              Next
            </Button>
          )}
        </SummaryBar>
      )}
    </main>
  </>
);
}
