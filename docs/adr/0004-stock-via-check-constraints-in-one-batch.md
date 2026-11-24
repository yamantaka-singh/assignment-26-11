# ADR-0004: Stock is guarded by CHECK constraints inside one atomic batch

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: the author

## Context

Brief section 6 rule 3: a completed booking reduces stock, the reduction survives, and two people booking the last two workshop places at once must not both succeed. Garba Workshop has 2 places, and All-Day Adult has 0. A booking touches several items at once (day passes, dinner, workshop), so a partial decrement would be a bug as well as an oversell.

## Decision

`inventory.remaining` has a `CHECK (remaining >= 0)` constraint (`inventory_remaining_non_negative`). `promo_codes.uses` has `CHECK (max_uses IS NULL OR uses <= max_uses)`.

Committing a booking is **one** `db.batch` (a D1 transaction) in `src/server/d1-repo.ts`:

1. insert the booking row (unique `idempotency_key`, unique `reference`),
2. for each item: `UPDATE inventory SET remaining = remaining - qty WHERE item_id = ?`,
3. if a promo applied: `UPDATE promo_codes SET uses = uses + 1 WHERE code = ?`.

If any CHECK or the unique key fails, the whole batch rolls back. The repo maps the constraint name in the error text to `stock-conflict`, `promo-conflict` or `duplicate-key`, and the service turns those into 409 `SOLD_OUT`, 409 `PROMO_EXHAUSTED`, or a replay of the winning booking.

Before the commit, `buildQuote` reads stock and returns a friendly "Only 1 Garba Workshop place is left" error. That read is advice only. The constraint is what decides.

## Alternatives considered

### Alternative 1: Read stock, check in app code, then write
- **Pros**: simplest to write.
- **Cons**: two requests both read 2, both pass, both write. Oversell.
- **Why not**: this is exactly the race the brief describes.

### Alternative 2: A Durable Object as a per-item lock
- **Pros**: serialises all bookings in one place; can hold reservations.
- **Cons**: another binding, another deploy concern, a single hot object, and the same atomicity already comes from the database for free.
- **Why not**: the constraint solves the one problem we have. A Durable Object becomes worth it only if reservations with expiry are needed (see Consequences).

### Alternative 3: Conditional UPDATE and check rows-affected
- **Pros**: also race-free for one item.
- **Cons**: multi-item bookings need explicit rollback logic.
- **Why not**: the batch plus CHECK gives all-or-nothing for any number of items with no extra code.

## Consequences

### Positive
- A loser takes nothing. Checked against local D1 with real HTTP (`docs/notes/concurrency-check.md`): two concurrent bookings for 2 workshop places each gave one 201 and one 409; six concurrent single-place bookings gave exactly two winners; stock ended at 0, never negative, and the losers left no partial decrement.
- The same constraint also protects against any future code path that forgets to check.

### Negative
- Error mapping depends on constraint names appearing in the driver's error text (`d1-repo.ts` walks the `cause` chain). A driver change could break it. An unrecognised error is rethrown as a 500, not swallowed.
- No holds: stock is only taken at payment. A person can fill the whole form and find the place gone at the end. The UI returns them to the step with a "just sold out" notice.
- Stock is never restored. There are no cancellations or refunds in scope.

### Risks
- **Ceiling.** D1 serialises writes through one primary. Fine for a few thousand attendees. A rush on one hot row (Garba, or Day Pass at midday) queues. Beyond that, move to reserved holds with expiry, likely in a Durable Object.
- **The concurrency check ran on local D1 only.** Production D1 batches are also transactional, but this was not proven against Cloudflare here.
- The HTTP responses of the check cannot say whether a 409 came from the pre-check or the CHECK. The commit-time path is covered by a unit test that feeds stale stock (`tests/api-bookings.test.ts`), and the constraint itself was triggered directly with `UPDATE ... remaining - 3`.
