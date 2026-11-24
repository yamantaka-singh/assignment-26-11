# ADR-0007: Age is a whole number measured on the first festival day

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: the author

## Context

Age drives price and eligibility (under 5 free, 5 to 11 child, 12 and over adult, booker 18 or over). The festival runs five days. A child who turns 12 on 12 Nov is a child on day one and an adult on day three. The brief does not say which counts, and says people will type nonsense and some will try to get in cheaply.

## Decision

- **Reference day: 10 Nov 2026**, the first festival day (`AGE_REFERENCE_DAY` in `src/domain/catalog.ts`). One age, one band, for the whole booking. A child who turns 12 mid-festival stays a child. It is simple, predictable on the door, and favours the family.
- **Age is a whole number from 0 to 120.** `12abc`, `-1`, `3.5`, `999`, an empty value and a non-number are rejected by the zod schema with an "Age must be a whole number between 0 and 120" message (`src/domain/schema.ts`). The browser keeps the raw text so "1" then "12" is not lost, and shows the problem before the request is sent.
- **The server enforces the band.** A 7-year-old on an adult ticket is rejected by `ticketRules`. The pricing code derives the ticket price from the age band, not from any client field. A client cannot send a price or a band (strict schema).
- **Booker is 18 or over** whether or not they are attending. Children under 12 need someone aged 18 or over in the group.

## Alternatives considered

### Alternative 1: Age on each day
- **Pros**: most literal.
- **Cons**: one person could be priced as child on some days and adult on others. The all-day pass and the Family Pass would need per-day banding.
- **Why not**: complexity for a few birthdays that fall inside five days.

### Alternative 2: Collect date of birth
- **Pros**: age is computed, not typed. Removes "age on 10 Nov" ambiguity.
- **Cons**: more personal data about children than the door needs, and a worse form on a phone.
- **Why not**: the brief suggests thinking about which fields make sense for a nine-year-old.

### Alternative 3: Age on the day of booking
- **Pros**: easy to explain.
- **Cons**: depends on when someone books, and has no relation to the day they attend.
- **Why not**: arbitrary.

## Consequences

### Positive
- The band is the same for pricing, eligibility and the door list.
- Nonsense input never reaches pricing.

### Negative
- **The server cannot verify an age.** It trusts the typed number, and a parent who types 4 for a 5-year-old saves the fee. The door check is the control for that. This is a known gap.
- **The form hint does not yet say "age on 10 Nov".** It shows only the band ("Child (5 to 11)"). The reference day is a rule in the code, not yet stated to the person.
- The rule is hard-coded to the 2026 dates. For another festival it is per-festival data (README, "Running ten festivals").
