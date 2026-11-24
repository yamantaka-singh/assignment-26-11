# Design note: Sharad Utsav 2026 booking

Written before coding. I won't rewrite it later to match the code: where the plan changed, the README says so.

## Stack

Void (Vite + Hono on Cloudflare Workers) with React, D1 (SQLite) for stock, and zod at the API boundary. The brief asks for Next.js on Vercel. I chose Void because one CLI provisions the database, runs migrations and deploys, and because D1 gives me real SQL constraints for stock. To keep the Vercel URL the brief asks for, a tiny Vercel project rewrites every path to the Workers app. The trade-off is in ADR-0001.

## Modelling

- **Money:** integer cents everywhere. Formatting happens only at the edge with `Intl.NumberFormat`.
- **Items:** a fixed catalog keyed by id (`day-adult`, `day-child`, `allday-adult`, `allday-child`, `family`, `dandiya`, `dinner`, `garba`). Rules use ids and kinds, never labels, so renaming a ticket can't break a rule.
- **Dates:** a `FestivalDay` union of the five ISO dates. The Garba workshop days are a subset.
- **People:** `Attendee { id, name, age, ticket }`. `ticket` is a discriminated union: `day { days[] }`, `allDay`, `family { passId }` or `none` (under-5). A child's attendee record has no email or phone. The booker is separate (name, email, phone, age), and a flag says whether they are attending.
- **Family Pass:** a group-level item `{ id, day }` that attendees point to.
- **Extras:** dinner is per attendee per day, the workshop is per attendee per session, dandiya is a quantity.
- **Pure core:** `src/domain/` has no framework imports. `validateBooking` turns unknown JSON into a `ValidBooking` or field errors. `priceBooking` turns it into a quote. Server and UI share this code, but only the server's numbers count.

## Endpoints

- `GET /api/catalog`: prices, days and live stock.
- `POST /api/quote`: the booking draft plus an optional promo code, returning a priced quote or field errors. It has no side effects.
- `POST /api/bookings`: the same body plus the payment, with an `Idempotency-Key` header. It re-validates and re-prices, charges (simulated), then in one D1 batch decrements stock, uses the promo and inserts the booking. It returns 201, or 402, 409 or 422.
- `GET /api/bookings/:id`: the confirmation.

## Tricky cases spotted so far

Under-5s (count them at the door, charge $0). Family Pass with fewer than 2+2 people. All-Day Adult sold out. Five day passes costing more than an all-day pass. Two workshop seats shared by two sessions. Dinner only on days the person attends. A booker who isn't attending. Children with no adult. When age is measured. Promo stacking, $0 totals and rounding. Double-clicks and retries. Two people racing for the last seat. The festival dates being in the past relative to today.

## Not doing

- Real Stripe: simulated test cards instead. The capture-after-reserve flow is written up instead.
- Accounts or login, an admin UI, emailing the confirmation (it's shown on screen with a reference), refunds or changes after booking.
- A sales-window cutoff. The festival dates have already passed, and a cutoff would make the demo unusable.
