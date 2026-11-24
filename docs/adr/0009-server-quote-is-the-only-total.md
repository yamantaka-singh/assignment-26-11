# ADR-0009: The server's quote is the only total that exists

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: the author

## Context

Brief section 6 rule 1 and section 10: prices, discounts and the final amount are decided on the server from the server's data. Someone will edit the request in dev tools. The page still needs a live total as the person changes their mind.

## Decision

- The request body has **no price field**. Every object in the schema is strict, so an extra key such as `totalCents` or `priceCents` is rejected with 422 `unexpected_field` (`src/domain/schema.ts`).
- `POST /api/quote` runs the same pipeline as booking: validate, load the promo record, evaluate it against the server clock, price, check stock (`src/server/quote.ts`). It has no side effects.
- `POST /api/bookings` re-runs that pipeline from scratch. The amount charged and stored is `quote.totalCents` from that fresh run. It never reads a total, a quote or a stock figure from the request.
- The browser debounces a quote request on every change and shows the result. Its reducer has no pricing code (ADR-0008).
- The booking row stores the quote that was charged (`quote_json`) and `amount_cents`, so the confirmation shows what was actually priced.

## Alternatives considered

### Alternative 1: Client computes, server verifies by recomputing and comparing
- **Pros**: instant totals.
- **Cons**: two implementations of the rules; a mismatch needs an error path for an honest user.
- **Why not**: the quote endpoint gives live totals from one implementation.

### Alternative 2: Server computes only at payment
- **Pros**: one call.
- **Cons**: the person sees no price while choosing, and discovers errors late.
- **Why not**: poor experience for the same safety.

## Consequences

### Positive
- No path from the browser to the amount. Tampering tests post injected prices and get 422.
- Promo expiry and usage are decided with the server's clock and counters.
- The quote also carries `stockNeeded`, which is what the commit step decrements.

### Negative
- Every edit costs a network call. A slow network means a visible "updating total" state, and offline means no total at all.
- Between quote and pay, stock or promo status can change. That is handled at commit (409 `SOLD_OUT` or `PROMO_EXHAUSTED`), and the person is sent back to review.
- The quote is checked with an out-of-stock result as a 422 (`INVALID_BOOKING`) with `SOLD_OUT` field errors. The booking endpoint uses 409 for the same situation. The client handles both.
