// Tiny response helpers so every route speaks the same { error: { code, message, fields? } } envelope.
import type { ApiError } from '../domain/types';

export const MAX_BODY_BYTES = 100_000;

export const json = (body: unknown, status = 200): Response => Response.json(body, { status });

export const errorResponse = (status: number, error: ApiError['error']): Response => json({ error }, status);

export type JsonBody = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly response: Response };

/** Read and parse a JSON body, with a size cap. Failure is an HTTP response ready to return. */
export async function readJson(request: Request): Promise<JsonBody> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return { ok: false, response: errorResponse(413, { code: 'PAYLOAD_TOO_LARGE', message: 'That request is too large.' }) };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: errorResponse(400, { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' }) };
  }
}

export const internalError = (err: unknown): Response => {
  // Message only: request bodies (which may hold card numbers) are never logged.
  console.error('unhandled error', err instanceof Error ? err.message : 'unknown');
  return errorResponse(500, { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' });
};
