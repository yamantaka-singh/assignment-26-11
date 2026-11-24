# ADR-0003: Money is integer cents everywhere

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: the author

## Context

The brief flags totals like `$146.70000000000002`. Prices are whole dollars, but a 10% discount on $14.65 is not a whole number of cents, and a promo percentage multiplies every subtotal.

## Decision

Every amount in the domain, API, database and tests is an integer number of cents (`priceCents`, `totalCents`, `amount_cents INTEGER`). Formatting to dollars happens only at the screen edge (`Intl.NumberFormat` in `src/ui/components/MoneyText.tsx`).

Percent discounts are computed in integers: `Math.floor((subtotal * percent + 50) / 100)`, which rounds half up (`percentDiscountCents` in `src/domain/pricing.ts`). Example: SEVA10 on $14.65 (1465 cents) is 1465 * 10 + 50 = 14700, divided by 100 = 147 cents off. A flat discount is capped at the subtotal, so the total never goes below zero. The API response schema on the client requires `z.number().int()` for every cent field.

## Alternatives considered

### Alternative 1: Floating-point dollars, rounded at the end
- **Pros**: matches how prices are written in the brief.
- **Cons**: rounding bugs hide until a specific combination; sums can drift.
- **Why not**: the brief names this failure explicitly.

### Alternative 2: A decimal library
- **Pros**: exact, supports other currencies.
- **Cons**: a dependency for a USD-only event with whole-cent prices.
- **Why not**: integers already solve it, with no dependency.

## Consequences

### Positive
- Totals are exact. A test asserts every price and line is an integer.
- Safe to store, compare and sum in SQL.

### Negative
- Every display needs the formatter. A raw cents value shown by mistake would look 100 times too large.
- The half-up rule is a choice: 5% of an odd-cent amount rounds up, in the festival's disfavour by under one cent.
