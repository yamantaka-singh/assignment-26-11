# ADR-0005: Idempotent booking creation with a client key and a request hash

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: the author

## Context

Brief section 10 lists "someone clicking Pay twice" and protection against a double-click creating two bookings. Networks also drop replies: a person whose phone loses signal after the server committed will press Pay again.

## Decision

`POST /api/bookings` requires an `Idempotency-Key` header (8 to 100 printable ASCII characters, else 400 `IDEMPOTENCY_KEY_REQUIRED`).

- The browser issues one `crypto.randomUUID()` when the person enters the review step (`useIdempotencyKey` in `src/booking/effects.ts`). Editing the draft clears it, so a changed booking gets a new key. The Pay button is disabled while a request is in flight, and `usePaymentRequest` sends at most one request per key.
- The server stores the key in `bookings.idempotency_key` (UNIQUE) with `request_hash`, a SHA-256 of the canonical JSON (sorted keys) of the booking part of the request (`src/server/hash.ts`). The payment block is deliberately not hashed.
- Same key, same hash: return the stored booking, status 200 instead of 201. No second charge, no second stock decrement.
- Same key, different hash: 422 `IDEMPOTENCY_KEY_REUSED`.
- Two requests with the same key at the same instant: one batch commits, the other hits the unique index (`duplicate-key`), then reads and returns the winner.

## Alternatives considered

### Alternative 1: Disable the button only
- **Pros**: trivial.
- **Cons**: does nothing for retries after a lost reply, a second tab, or a script.
- **Why not**: the server is the one that must be safe.

### Alternative 2: Deduplicate on the content (same booker, same attendees, recent time)
- **Pros**: no client cooperation needed.
- **Cons**: cannot tell a double-click from a family that genuinely books twice; needs a time window.
- **Why not**: guesses at intent. A key states it.

### Alternative 3: Idempotency by booking id chosen by the client
- **Pros**: one fewer column.
- **Cons**: mixes identity with retry-safety; harder to detect a reused key with a different body.
- **Why not**: the separate key and hash give a clear error for misuse.

## Consequences

### Positive
- Checked on local D1 with three simultaneous same-key requests: one booking row, one stock decrement, replies 200/201/200 with the same booking id (`docs/notes/concurrency-check.md`).
- The same key is the natural idempotency key to pass on to Stripe (ADR-0006).

### Negative
- The replay lookup runs before validation and pricing, so a replay returns the original result even if stock or promo state has since changed. That is the point, but it is worth knowing.
- Keys are stored forever. There is no expiry job.
- A reference collision (about 1 in 10^9 per pair) would surface as a 500 and succeed on retry with the same key. Documented as a `ponytail:` note in `src/server/reference.ts`.
