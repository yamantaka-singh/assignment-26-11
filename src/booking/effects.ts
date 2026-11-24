// The only place the booking flow talks to the network. The reducer stays pure; these hooks turn
// its state into requests and turn answers back into actions.
import { useEffect, useRef, type Dispatch } from 'react';
import { getBooking, getCatalog, postBooking, postQuote, type ApiFailure } from '../api/client';
import type { BookingAction } from './actions';
import type { BookingState } from './machine';
import { buildRequest, requestKey } from './model';

const QUOTE_DEBOUNCE_MS = 300;
const UNCLEAR_REPLY =
  "We didn't get a clear answer from the server. It is safe to press Try again: you won't be charged twice.";
const NO_QUOTE = 'We could not check these details just now. Please try again.';
const BOOKING_HASH = /^#booking=([A-Za-z0-9-]{8,64})$/;

type Send = Dispatch<BookingAction>;

/** Debounced POST /api/quote for the current draft; a newer edit aborts the older request. */
export function useQuoteSync(state: BookingState, dispatch: Send): void {
  const live = state.step !== 'confirmed' && state.step !== 'paying';
  const key = requestKey(state.draft);
  useEffect(() => {
    const request = buildRequest(state.draft);
    if (!live || request === null) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const result = await postQuote(request, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok) return dispatch({ type: 'quoteLoaded', quote: result.value });
      const failure = result.error;
      if (failure.kind === 'aborted') return;
      if (failure.kind === 'http' && failure.status === 422) {
        const errors = failure.fields.length > 0 ? failure.fields : [{ code: failure.code, path: '', message: failure.message }];
        return dispatch({ type: 'quoteRejected', errors });
      }
      dispatch({ type: 'quoteUnavailable', offline: failure.kind === 'offline' });
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // The draft's identity is its serialised request: re-run only when what the server would see changes.
  }, [key, state.quoteNonce, live]);
}

/** Loads stock on arrival and again whenever the step or quote refreshes, so "sold out" stays honest. */
export function useCatalogSync(state: BookingState, dispatch: Send): void {
  const live = state.step !== 'confirmed';
  useEffect(() => {
    if (!live) return;
    const controller = new AbortController();
    void getCatalog(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) return dispatch({ type: 'catalogLoaded', catalog: result.value });
      if (result.error.kind !== 'aborted') dispatch({ type: 'catalogUnavailable', offline: result.error.kind === 'offline' });
    });
    return () => controller.abort();
  }, [state.step, state.quoteNonce, live]);
}

/** One idempotency key per checkout attempt, issued on entering review and reused until the draft changes. */
export function useIdempotencyKey(state: BookingState, dispatch: Send): void {
  const needsKey = state.step === 'review' && state.idempotencyKey === null;
  useEffect(() => {
    if (needsKey) dispatch({ type: 'keyIssued', key: crypto.randomUUID() });
  }, [needsKey]);
}

/** When the reducer accepts a payment (step becomes 'paying'), send exactly one request for this key. */
export function usePaymentRequest(state: BookingState, dispatch: Send): void {
  const sending = useRef<string | null>(null);
  useEffect(() => {
    if (state.step !== 'paying') return;
    const request = buildRequest(state.draft);
    const key = state.idempotencyKey;
    if (request === null || key === null) return dispatch({ type: 'payFailed', message: NO_QUOTE });
    if (sending.current === key) return;
    sending.current = key;
    const total = state.quote?.totalCents ?? 0;
    void postBooking({ request, idempotencyKey: key, cardNumber: total > 0 ? state.cardNumber : undefined }).then((result) => {
      sending.current = null;
      if (result.ok) {
        history.replaceState(null, '', `#booking=${encodeURIComponent(result.value.bookingId)}`);
        return dispatch({ type: 'payConfirmed', result: result.value });
      }
      dispatch(failureAction(result.error));
    });
  }, [state.step]);
}

function failureAction(failure: ApiFailure): BookingAction {
  switch (failure.kind) {
    case 'offline':
      return { type: 'payOffline' };
    case 'http':
      return { type: 'payRejected', status: failure.status, code: failure.code, message: failure.message, fields: failure.fields };
    case 'aborted':
    case 'malformed':
      return { type: 'payFailed', message: UNCLEAR_REPLY };
  }
}

/** Reloading after paying lands back on the confirmation (the URL holds only the opaque booking id). */
export function useRestoredConfirmation(dispatch: Send): void {
  useEffect(() => {
    const id = BOOKING_HASH.exec(window.location.hash)?.[1];
    if (id === undefined) return;
    void getBooking(id).then((result) => {
      if (result.ok) dispatch({ type: 'confirmationRestored', saved: result.value });
    });
  }, []);
}

/** Coming back online re-asks the server instead of leaving a stale "offline" banner. */
export function useReconnect(dispatch: Send): void {
  useEffect(() => {
    const onOnline = (): void => dispatch({ type: 'quoteRefreshRequested' });
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);
}
