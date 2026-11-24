# ADR-0006: Simulated payment now, authorise-reserve-capture when Stripe is added

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: the author

## Context

The brief accepts a simulated payment and calls Stripe test mode a nice extra. A real integration needs a Stripe account, keys in the environment, and a webhook. Whatever the payment provider, there is an ordering problem: if we charge first and stock then runs out, we owe a refund. If we reserve stock first and the card fails, stock is held for nothing.

## Decision

**What exists.** `src/server/payment.ts` simulates a processor. It is pure: the card number is read once, never stored, logged or returned.

| Card number | Result |
|---|---|
| `4242 4242 4242 4242` | approved |
| `4000 0000 0000 0002` | 402 `PAYMENT_DECLINED`, nothing booked |
| anything else | 422 `PAYMENT_INVALID` |

Spaces and dashes are ignored. A $0 total skips payment entirely: no card is asked for or read. The order in `createBooking` is: validate, re-price, check stock, simulate payment, then the atomic commit (ADR-0004). A decline therefore touches no stock and no promo use.

**What it would be with Stripe** (not built): create a PaymentIntent with `capture_method: manual` (authorise only, using the booking's idempotency key as Stripe's idempotency key), run the atomic commit batch (reserve), then capture. If the batch returns 409, cancel the authorisation, so the card is never charged. If capture fails after commit, mark the booking `payment_failed` and release its stock in a follow-up job. A webhook would confirm the final state. Authorise-first means a bad card never holds stock, and reserve-before-capture means we never take money for stock that is not there.

## Alternatives considered

### Alternative 1: Real Stripe test mode now
- **Pros**: closest to production, shows the full flow.
- **Cons**: needs an account, keys and a webhook, and is not required by the brief.
- **Why not**: time spent on the rules and stock was judged worth more. This ADR shows the intended path.

### Alternative 2: Capture first, refund on stock failure
- **Pros**: simpler to code.
- **Cons**: refunds take days, and the customer sees a charge for a booking they do not have.
- **Why not**: the failure mode costs trust.

### Alternative 3: Reserve stock first, then charge
- **Pros**: no refunds.
- **Cons**: needs hold expiry and a release job.
- **Why not**: more machinery than a two-step authorise/capture.

## Consequences

### Positive
- The demo is fully testable without credentials. No secrets exist in the repo or in the deploy.
- The decline path is tested and leaves no trace in the database.

### Negative
- In the simulation there is no authorisation to cancel, so the "cancel on 409" step is described but not exercised.
- Card numbers pass through our server in the simulated flow. A real integration would use Stripe Elements so the card never reaches us.
- No confirmation email is sent. The confirmation is on screen with a reference, and restorable via `#booking=<id>`.
