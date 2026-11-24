// The browser's only door to the API. Every response is checked with zod; no casts.
// Failures are values, not exceptions: callers decide what each one means for the person.
import { z } from 'zod';
import type { BookingRequest, Quote, Result, RuleError } from '../domain/types';
import {
  apiErrorSchema,
  bookingResultSchema,
  catalogSchema,
  quoteResponseSchema,
  savedBookingSchema,
  type BookingResult,
  type CatalogView,
  type SavedBooking,
} from './schemas';

export type ApiFailure =
  | { readonly kind: 'offline' }
  | { readonly kind: 'aborted' }
  | { readonly kind: 'malformed' }
  | {
      readonly kind: 'http';
      readonly status: number;
      readonly code: string;
      readonly message: string;
      readonly fields: readonly RuleError[];
    };

export type ApiResult<T> = Result<T, ApiFailure>;

const GENERIC = 'Something went wrong on our side. Please try again.';
const ok = <T>(value: T): ApiResult<T> => ({ ok: true, value });
const fail = (error: ApiFailure): ApiResult<never> => ({ ok: false, error });

const isAbort = (err: unknown): boolean => err instanceof DOMException && err.name === 'AbortError';

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

async function call<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<ApiResult<T>> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return fail({ kind: 'offline' });
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (err) {
    // fetch only rejects when no response arrived at all: the network is down or the request was aborted.
    return fail(isAbort(err) ? { kind: 'aborted' } : { kind: 'offline' });
  }
  const body = await readJson(res);
  if (res.ok) {
    const parsed = schema.safeParse(body);
    return parsed.success ? ok(parsed.data) : fail({ kind: 'malformed' });
  }
  const error = apiErrorSchema.safeParse(body);
  return fail({
    kind: 'http',
    status: res.status,
    code: error.success ? error.data.error.code : 'UNKNOWN',
    message: error.success ? error.data.error.message : GENERIC,
    fields: error.success ? (error.data.error.fields ?? []) : [],
  });
}

const jsonInit = (method: string, body: unknown, signal?: AbortSignal, headers: Record<string, string> = {}): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
  signal,
});

export const getCatalog = (signal?: AbortSignal): Promise<ApiResult<CatalogView>> =>
  call('/api/catalog', { signal }, catalogSchema);

export async function postQuote(request: BookingRequest, signal?: AbortSignal): Promise<ApiResult<Quote>> {
  const result = await call('/api/quote', jsonInit('POST', request, signal), quoteResponseSchema);
  return result.ok ? ok(result.value.quote) : result;
}

export interface BookingSubmission {
  readonly request: BookingRequest;
  /** Omitted for a $0 booking. Sent once to the server and never kept by the browser after that. */
  readonly cardNumber?: string;
  readonly idempotencyKey: string;
}

export const postBooking = ({ request, cardNumber, idempotencyKey }: BookingSubmission): Promise<ApiResult<BookingResult>> =>
  call(
    '/api/bookings',
    jsonInit('POST', cardNumber === undefined ? { booking: request } : { booking: request, payment: { cardNumber } }, undefined, {
      'Idempotency-Key': idempotencyKey,
    }),
    bookingResultSchema,
  );

export const getBooking = (id: string): Promise<ApiResult<SavedBooking>> =>
  call(`/api/bookings/${encodeURIComponent(id)}`, {}, savedBookingSchema);
