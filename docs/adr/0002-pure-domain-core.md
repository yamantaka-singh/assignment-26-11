# ADR-0002: Pure domain core, thin routes, injectable repository

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: the author

## Context

The brief says the hard part is the rules, and that the price must be right "no matter what the person clicks". It warns against business rules in the UI, rules that match on labels, and validation that exists only in the browser. The interview also asks for a new rule to be added live, so the place for rules must be obvious.

## Decision

Rules live in `src/domain/` and import nothing from React, Void, Hono or D1:

| File | Role |
|---|---|
| `catalog.ts` | Item ids, prices, days, limits. Rules use ids and kinds, never labels. |
| `schema.ts` | zod structural parse of untrusted JSON (strict objects: unknown keys rejected). |
| `eligibility.ts` | Business rules (age, tickets, Family Pass, extras, group). Returns every error at once, with dot paths like `attendees.2.age`. |
| `pricing.ts` | `priceBooking` returns lines, totals and hints in integer cents. |
| `promo.ts` | `evaluatePromo` returns a union: none, applied, unknown, expired, exhausted. |

`validateBooking` is the only producer of the branded `ValidBooking` type, and `priceBooking` accepts only that. A price for an unvalidated booking is a compile error.

`src/server/` holds the services (`quote.ts`, `booking.ts`, `stock.ts`, `payment.ts`). They reach storage only through the `Repo` interface in `src/server/repo.ts`. `routes/api/*` are 12 to 25 line handlers: read JSON, call a service, map the outcome to a status code. `src/server/d1-repo.ts` is the only file that touches `void/db`.

The UI imports types and `ageBand`/`entryDays` for instant hints. The payable total always comes from the server.

## Alternatives considered

### Alternative 1: Rules inline in route handlers
- **Pros**: fewer files.
- **Cons**: the UI would need its own copy to give instant feedback, and the two would drift.
- **Why not**: the brief names this as the main trap.

### Alternative 2: Shared rules in a package, UI computes the total too
- **Pros**: instant totals with no round trip.
- **Cons**: two places that can disagree; invites trusting the client number.
- **Why not**: see ADR-0009.

## Consequences

### Positive
- Rules, pricing and promos are tested with plain function calls and no database (`tests/pricing.test.ts`, `eligibility.test.ts`, `promo.test.ts`).
- The booking service is tested with an in-memory `Repo` (`tests/helpers/memory-repo.ts`), including a stale-stock commit race.
- A new rule is one function added to `RULES` in `eligibility.ts`.

### Negative
- More files than a single handler would need.
- The in-memory `Repo` does not enforce CHECK constraints. Real constraint behaviour was checked by hand against local D1 (ADR-0004).
