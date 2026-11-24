# Sharad Utsav 2026 booking

A family books festival tickets in one go, pays (simulated), and gets a confirmation. The server decides every price, rule and stock count.

- **Live URL:** `https://<pending-deploy>.workers.dev` (TODO: replace after `void deploy`, see [docs/DEPLOY.md](docs/DEPLOY.md))
- **GitHub repo:** `<pending: add repo URL>` (TODO)
- **Deviation from the brief:** this runs on Void / Cloudflare Workers with D1, not Next.js on Vercel. Why, and the risk: [ADR-0001](docs/adr/0001-void-on-cloudflare-instead-of-nextjs-vercel.md).

## Quick start

Needs Node 24.22+ or 26.12+.

```sh
npm install
npx void db migrate     # create the local D1 database: schema + seed (stock and promo codes)
npm run dev             # http://localhost:5173
npm test                # vitest via `vp test run`
npm run typecheck
```

To restore stock and promo usage to the seed values: `npx void db reset --yes`, then restart the dev server.

Test card for the simulated payment: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` is declined. Only the card number is asked for; no expiry or CVC is collected.

## Deploying

Deploy with `void deploy`. Steps, migrations in production and how to check that stock persists: [docs/DEPLOY.md](docs/DEPLOY.md).

## Environment variables

None. A search of `src/`, `routes/`, `pages/`, `db/` and the config files finds no `process.env`, `env.` or `import.meta.env` reads. The D1 database is bound by Void at deploy time. Deploy authentication is handled by the Void CLI login (`void auth login`). No secrets are committed, and `.env*` is in `.gitignore`. There is no payment key because payment is simulated.

## Project structure

```
src/domain/     Pure business rules. No framework imports. Shared by server and UI.
  catalog.ts      Item ids, prices (cents), festival days, limits
  schema.ts       zod parse of untrusted JSON (strict: unknown keys rejected)
  eligibility.ts  Age, ticket, Family Pass, extras and group rules; returns all errors with field paths
  pricing.ts      Quote in integer cents, hints, stock units needed
  promo.ts        Promo evaluation (none / applied / unknown / expired / exhausted / not-applicable)
  types.ts        Shared domain and API types
src/server/     Services behind the routes. Storage only through the Repo interface.
  quote.ts        validate -> promo -> price -> stock check (shared by /quote and /bookings)
  booking.ts      idempotency, payment, atomic commit, outcome mapping
  d1-repo.ts      The only file that touches D1: one db.batch per booking
  stock.ts, payment.ts, hash.ts, reference.ts, confirmation.ts, catalog.ts, http.ts, repo.ts
routes/api/     Thin Void handlers: catalog, quote, bookings, bookings/[id]
db/             schema.ts (CHECK constraints) and migrations (schema + seed)
src/booking/    The booking flow: reducer state machine, effects (network hooks), step components
src/api/        Typed browser API client; every response is checked with zod
src/ui/         Theme tokens (theme.css) and small accessible components
pages/          The single page and its <head>
tests/          Vitest suites (see Testing)
docs/adr/       Architecture decision records (index: docs/adr/README.md)
docs/notes/     concurrency-check.md: manual race test against local D1
docs/plans/     The implementation plan
DESIGN.md       Pre-coding design note. Not edited after the fact.
TEST-CASES.md   My list of edge cases and where each is enforced
```

## API contract

All bodies are JSON. Every error uses one envelope:

```json
{ "error": { "code": "SOLD_OUT", "message": "Garba Workshop is sold out.", "fields": [ { "code": "SOLD_OUT", "path": "stock.garba", "message": "Garba Workshop is sold out." } ] } }
```

`fields` is present for rule and stock errors. `path` is a dot path into the request (`attendees.2.age`, `stock.garba`). Bodies over 100,000 characters return 413. Money is always integer cents.

| Method | Path | Request | Success | Errors |
|---|---|---|---|---|
| GET | `/api/catalog` | none | `200 { event, days, garbaDays, items[] }`. Each item: `{ id, label, priceCents, unit, remaining, soldOut }` | 500 `INTERNAL` |
| POST | `/api/quote` | A `BookingRequest` (below), optional `promoCode` inside it. No side effects. | `200 { quote }` | 400 `INVALID_JSON`; 413 `PAYLOAD_TOO_LARGE`; **422 `INVALID_BOOKING`** with `fields` for rule errors **and for out-of-stock items** (`code` `SOLD_OUT` or `INSUFFICIENT_STOCK`); 500 |
| POST | `/api/bookings` | Header `Idempotency-Key` (8 to 100 printable ASCII). Body `{ booking: BookingRequest, payment?: { cardNumber } }`. `payment` is not needed when the total is $0. | `201 { bookingId, reference, amountCents, quote }`. A replay of the same key and body returns `200` with the same body. | 400 `IDEMPOTENCY_KEY_REQUIRED`, `INVALID_JSON`, `INVALID_REQUEST`; 402 `PAYMENT_DECLINED`; 409 `SOLD_OUT` (with `fields`), `PROMO_EXHAUSTED`, `CONFLICT`; 413; 422 `INVALID_BOOKING` (with `fields`), `PAYMENT_INVALID`, `IDEMPOTENCY_KEY_REUSED`; 500 |
| GET | `/api/bookings/:id` | none | `200 { bookingId, reference, booker: { name, email }, attendees: [{ name, ticket }], quote, createdAt }`. No phone, no card data. | 404 `NOT_FOUND` |

**`BookingRequest`** (strict: any other key, such as a price or total, is rejected with 422 `unexpected_field`):

| Field | Type |
|---|---|
| `booker` | `{ name, email, phone, age, attending }` |
| `attendees` | 1 to 20 of `{ id, name, age, ticket, dinnerDays[], garbaDays[] }`. When `booker.attending`, the first attendee is the booker. |
| `ticket` | `{ kind: "day", days[] }`, `{ kind: "allDay" }`, `{ kind: "family", passId }` or `{ kind: "none" }` (under-5 only) |
| `familyPasses` | up to 10 of `{ id, day }` |
| `dandiyaQty` | integer 0 to 20 |
| `promoCode` | optional string, up to 32 characters; trimmed and case-insensitive |

Days are ISO dates `2026-11-10` to `2026-11-14`. Garba days are `2026-11-11` and `2026-11-13` only.

Example `POST /api/bookings` with `Idempotency-Key: 5f0c9a3e-7b1d-4c58-9a62-1d4e8f27b0aa`:

```json
{
  "booking": {
    "booker": { "name": "Meera Patel", "email": "meera@example.com", "phone": "+1 214 555 0142", "age": 40, "attending": true },
    "attendees": [
      { "id": "booker", "name": "Meera Patel", "age": 40, "ticket": { "kind": "day", "days": ["2026-11-11"] }, "dinnerDays": ["2026-11-11"], "garbaDays": ["2026-11-11"] },
      { "id": "p2", "name": "Aarav", "age": 9, "ticket": { "kind": "day", "days": ["2026-11-11"] }, "dinnerDays": [], "garbaDays": [] }
    ],
    "familyPasses": [],
    "dandiyaQty": 2,
    "promoCode": "SEVA10"
  },
  "payment": { "cardNumber": "4242 4242 4242 4242" }
}
```

`201` response (`bookingId` and `reference` vary):

```json
{
  "bookingId": "a3c5a046-81ba-431e-b35f-51ea6b20959c",
  "reference": "SU26-74T6GS",
  "amountCents": 5850,
  "quote": {
    "lines": [
      { "itemId": "day-adult", "label": "Day Pass – Adult (12+) – Meera Patel", "attendeeId": "booker", "qty": 1, "unitCents": 1500, "totalCents": 1500 },
      { "itemId": "dinner", "label": "Dinner Plate – Meera Patel", "attendeeId": "booker", "qty": 1, "unitCents": 1200, "totalCents": 1200 },
      { "itemId": "garba", "label": "Garba Workshop – Meera Patel", "attendeeId": "booker", "qty": 1, "unitCents": 2000, "totalCents": 2000 },
      { "itemId": "day-child", "label": "Day Pass – Child (5–11) – Aarav", "attendeeId": "p2", "qty": 1, "unitCents": 800, "totalCents": 800 },
      { "itemId": "dandiya", "label": "Dandiya Sticks (pair)", "qty": 2, "unitCents": 500, "totalCents": 1000 }
    ],
    "subtotalCents": 6500,
    "discountCents": 650,
    "totalCents": 5850,
    "promo": { "status": "applied", "code": "SEVA10", "kind": "percent", "value": 10, "message": "SEVA10 applied." },
    "hints": [],
    "stockNeeded": { "day-adult": 1, "dinner": 1, "garba": 1, "day-child": 1, "dandiya": 2 }
  }
}
```

The quote above was produced by running the request through `validateBooking` and `priceBooking`. `bookingId` and `reference` are illustrative.

## Decisions I made

The brief (section 8) left situations open. Each is below: the situation, what the app does, why. **Charge** says whether it changes what a person pays. All are enforced on the server. Constants are in `src/domain/catalog.ts`.

| # | Situation | What the app does | Why | Charge |
|---|---|---|---|---|
| D1 | Under-5s need no ticket. Do the volunteers need them? | They are listed as attendees (name, age) with a `none` ticket, at $0. They can have a dinner plate. | The door headcount must be right. | Yes ($0) |
| D2 | Family Pass "covers 2 adults and 2 children": what about 2 adults and 1 child, or 3 children? | A pass covers up to 2 adults (12+) and up to 2 children (5 to 11) on one day, at least 1 adult. Under-5s ride free. If individual Day Passes would be cheaper, a hint says so. It never switches the ticket for you. | A rigid "exactly 2+2" would force people to pay for empty places. The hint is advice, not a rule. | Yes |
| D3 | All-Day Adult is sold out (0 left). | Shown sold out. A server hint suggests 5 Day Passes ($75) when that fits. | Stock is real, and the person still has a route. | No |
| D4 | Five Day Passes can cost more than an All-Day Pass (child: $40 vs $30). | The server adds a non-blocking "cheaper option" hint. | The person decides. | No (hint) |
| D5 | Garba Workshop has 2 places: per session or one pool? | One shared pool of 2 across Nov 11 and 13, as the stock table says. A person needs entry on that day. At most one workshop per person per session. | Matches the brief's stock figure. | No |
| D6 | Dinner Plate is "per person, per day": which days? | Only days the person has entry (any ticket type, under-5s included). | Selling dinner for a day nobody attends is an error. | Yes |
| D7 | Is the booker attending? | A checkbox. If attending, the booker is attendee 1 and must have the same name and age as in their details. The booker must be 18 or over either way. | The payer is an adult. Mismatched self-details would split one person into two. | Yes |
| D8 | Children with no adult in the group. | Anyone under 12 requires someone aged 18 or over in the group. | A child cannot be dropped at the door alone. | No (blocks) |
| D9 | When is age measured? | On the first festival day, 10 Nov 2026, as a whole number 0 to 120. A child turning 12 mid-festival stays a child. See [ADR-0007](docs/adr/0007-age-measured-on-first-festival-day.md). | One band per person keeps tickets and the door list simple, and favours the family. | Yes |
| D10 | Promo stacking and floors. | One code per booking, trimmed, case-insensitive. SEVA10 is 10% of the subtotal including extras, rounded half up to the cent. FLAT20 never takes the total below $0. KIDSFREE zeroes child Day and All-Day lines only, not Family Pass or extras. If there are no child tickets it says so (`not-applicable`). Unknown, expired and fully-used codes each get their own friendly message and the booking continues without a discount. | Predictable, and a bad code never blocks a booking. | Yes |
| D11 | A $0 total (KIDSFREE on kids only, FLAT20 on a $15 order). | The payment step is skipped. The booking is confirmed with `amountCents: 0`. | Asking for a card to pay nothing is wrong. | Yes |
| D12 | What is one unit of Day Pass stock? | One person-day. A Family Pass uses one Family Pass unit, not Day Pass stock. | Stock figures in the brief are per item. | No |
| D13 | The festival dates (10 to 14 Nov) have already passed. | **Left unhandled on purpose.** No sales-window cutoff. | A cutoff would make the demo unusable for the reviewer. A real deployment needs one. | No |
| D14 | Dandiya quantity and group size. | 0 to 20 pairs per booking. 1 to 20 attendees. Up to 10 Family Passes. | A cap that stops absurd requests. The brief says "any reasonable quantity". | No |
| D15 | Double-click or retried Pay. | An `Idempotency-Key` per checkout. A repeat returns the original booking. See [ADR-0005](docs/adr/0005-idempotent-booking-creation.md). | One booking per intent. | No |
| D16 | Payment versus stock ordering. | Simulated: the card is checked, then stock, promo use and the booking are committed in one atomic batch. A decline touches nothing. With real Stripe it would be authorise, reserve, capture, and cancel the authorisation on 409. See [ADR-0006](docs/adr/0006-simulated-payment-and-stripe-path.md). | Never take money for stock that is not there. | No |

Also decided in the code, not in the D-list:

- **Under-5s cannot take the Garba workshop** (`garba_min_age`). Under-5s are not ticketed, so a workshop place cannot be sold to them. This changes what they can buy.
- **An under-5 cannot hold a Day or All-Day ticket.** They are either on no ticket or on a Family Pass. A per-person ticket on a toddler is rejected with "they come in free".
- **A Family Pass nobody is on is an error** (`family_pass_empty`).
- **Promo codes are consumed only when a booking commits.** A declined card or a sold-out 409 does not use one up.
- **`MAXEDOUT` is evaluated from the database counter**, and a race for the last use is caught by a CHECK constraint: the loser gets 409 `PROMO_EXHAUSTED`.

## How the plan changed

`DESIGN.md` was written before coding and is not edited. The code differs from it as follows.

| DESIGN.md said | The code does |
|---|---|
| A tiny Vercel project rewrites every path to the Workers app, to keep a Vercel URL. | Dropped. Void only. See [ADR-0001](docs/adr/0001-void-on-cloudflare-instead-of-nextjs-vercel.md). |
| `Attendee { id, name, age, ticket }`. | Also carries `dinnerDays` and `garbaDays`. Family Passes are a separate `familyPasses` list that tickets point to by `passId`. |
| `POST /api/quote`: draft plus optional promo, returns a priced quote. | The body is the bare `BookingRequest` with `promoCode` inside it. The response is `{ quote }`. Out-of-stock is also a 422 (see Known gaps). |
| `POST /api/bookings`: same body plus payment. | The body is an envelope: `{ booking, payment? }`. The idempotency header must be 8 to 100 printable ASCII characters. |
| Returns 201, or 402, 409, 422. | Also 200 for an idempotent replay, 400 for a missing key or malformed envelope, 413 for a large body, 404 on GET. A `request_hash` detects a reused key with a different body (422 `IDEMPOTENCY_KEY_REUSED`). |
| `GET /api/bookings/:id`: the confirmation. | A deliberately small view: booker name and email, attendee name and ticket, the quote. The page also restores the confirmation after a reload from `#booking=<id>`. |
| Promo outcomes: applied, unknown, expired, exhausted. | Adds `not-applicable` (KIDSFREE with no children in the booking). |
| Tricky-case list. | Several cases above were found while building: Garba minimum age, booker name and age matching attendee 1, empty Family Pass, toddlers on a Family Pass. |
| Tests mock the database. | Tests inject an in-memory `Repo`. The real CHECK and batch behaviour was checked by hand on local D1 ([docs/notes/concurrency-check.md](docs/notes/concurrency-check.md)). |

## Testing

`npm test` runs 239 tests in 10 files at the time of writing (the count rises as edge-case tests land; run it for the current number). They pin down the places where being wrong costs money or admits the wrong person:

- **Pricing** (`pricing.test.ts`): every ticket and extra, per-day multiplication, Family Pass hints, All-Day versus Day Pass hints, integer-cent guards, rounding (SEVA10 on $14.65 is $1.47 off), the FLAT20 floor, KIDSFREE with mixed groups, $0 totals.
- **Promo** (`promo.test.ts`): none, applied, unknown, expired, exhausted, case and whitespace.
- **Age and eligibility** (`eligibility.test.ts`): age bands at their boundaries; 7-year-old on an adult ticket; 17-year-old booker; Family Pass limits; dinner or workshop without entry; children with no adult.
- **Request schema** (`schema.test.ts`): `12abc`, `-1`, `3.5`, `999`, injected `priceCents`, unknown keys, duplicates.
- **Booking service** (`api-bookings.test.ts`, `api-units.test.ts`): server-side pricing, tampering, idempotent replay, reused key, decline touches nothing, stock vanishing between check and commit, promo exhaustion.
- **State machine** (`machine.test.ts`): attendee and ticket consistency as the person edits, step gating from the server quote, 409 routing, double-submit guard.
- **Seed migration** (`seed-migration.test.ts`): the SQL seed matches the catalog and promo constants.

The list of situations I thought of, with expected behaviour and where each is enforced, is in [TEST-CASES.md](TEST-CASES.md).

What the unit tests do not prove: real D1 constraint behaviour (checked by hand, locally only) and the UI in a browser.

## Accessibility and UX notes

Colours are the brand tokens, with contrast checked and recorded at the top of `src/ui/theme.css`. Several brand colours fail as small text, so derived tints are used:

| Use | Colours | Ratio |
|---|---|---|
| Body text on dark | `#FFFFFF` on `#2C2C2C` | 13.97 |
| Muted text on dark | white 72% | 8.01 |
| Gold text on dark | `#C99B24` on `#2C2C2C` | 5.45 |
| Primary button label | `#291900` on `#C99B24` (white on gold is 2.56 and not used) | 6.65 |
| Error text on dark | `#FF8A80` (brand `#EF1F1F` is 3.25 and fails for small text) | 6.12 |
| Success text on dark | `#5FD36E` (brand `#28A736` is 4.44) | 7.33 |
| Error text on cream | `#B3120F` (brand red is 3.91) | 6.35 |
| Success text on cream | `#1B7A27` (brand green is 2.87) | 4.95 |
| Heading and body on cream | `#291900`, `#645743` | 15.50, 6.40 |
| Form control borders | white 55% (the brand 20% border is 1.90, so it is decoration only) | 5.34 |

Also: visible focus ring (flips to dark inside cream panels), 48px touch targets, a 360px-wide layout, labelled fields with `aria-describedby` errors, focus moved to the step heading on each step and to the first problem field on a blocked Next, loading, offline and error banners with retry, and `prefers-reduced-motion` respected. Headings use Lora (Google Fonts), body text uses the system sans-serif.

## Unfinished and known gaps

Stated plainly:

- **Not on Vercel.** The live site is a `workers.dev` URL on Cloudflare. See ADR-0001.
- **Live URL and repo link are placeholders** until the deploy and push are done by the author.
- **No real Stripe.** Payment is simulated (ADR-0006). Card numbers pass through the server in the demo.
- **No confirmation email.** The confirmation is on screen with a reference, and restorable from `#booking=<id>`.
- **No sales-window cutoff** (D13). The festival dates have passed. A real deployment must add one.
- **Age is typed, not verified** (ADR-0007), and the form hint does not yet say "age on 10 Nov".
- **Some hints show ISO dates.** The Family Pass hints say "on 2026-11-10". The ticket text from `GET /api/bookings/:id` also uses ISO dates for Day Pass days. The reload-restore screen therefore reads differently from the first confirmation.
- **The "All-Day Pass is sold out" hint reads the catalog's starting stock**, not live stock. It is correct today because All-Day Adult starts at 0. It would be stale if that item were restocked or another sold out.
- **Out-of-stock on `/api/quote` is a 422 with message "Some booking details need fixing"**, while `/api/bookings` returns 409 for the same condition. The client handles both. A 409 on quote would be cleaner.
- **No rate limiting or bot protection** on any endpoint, including promo-code guessing. Cloudflare rate limiting would be the first addition.
- **`GET /api/bookings/:id` is unauthenticated.** The id is a random UUID, but anyone holding it sees the booker's name and email.
- **No admin view, no door check-in list, no refunds, edits or cancellations.** Stock is never returned.
- **No holds.** Stock is taken at payment only, so a person can be told "sold out" at the last step.
- **Keyboard and screen-reader behaviour were designed in but have not been formally audited.** No automated browser tests (Playwright) are included.
- **Concurrency was checked on local D1 only**, not against Cloudflare production.
- **No i18n.** English only, USD only.

## Running ten festivals

Not built. This is what would change, and what would stay.

**Becomes data**, keyed by a `festival_id` column on every table:

- A `festivals` table: name, location, dates (replaces `FESTIVAL`, `FESTIVAL_DAYS`, `GARBA_DAYS`).
- `catalog_items`: id, label, price in cents, unit, valid days, age band, inventory. Replaces `CATALOG`. Keep ids stable and keep rules keyed on ids and kinds.
- `inventory(festival_id, item_id, remaining)` with the same CHECK. `promo_codes(festival_id, code, ...)`. `bookings(festival_id, ...)`. The unique idempotency key stays global.
- Routes become `/api/festivals/:festivalId/...` (or the festival is resolved from the host). The booking request carries no festival data beyond the id in the path.

**Rules as configuration.** Today the thresholds are constants: ages 5, 12 and 18, the age reference day, Family Pass shape (2+2), caps (20 attendees, 20 dandiya), and the Garba days. These move into a per-festival `rules` record. The rules in `eligibility.ts` read from it instead of from imports. A festival that needs a genuinely new rule (for example "seniors free") adds one function to the `RULES` list and a config switch.

**Stays code**: the validation and pricing pipeline, integer-cents arithmetic, the promo kinds (percent, flat, kids-free, and new kinds as new code), the atomic CHECK-guarded commit, idempotency, the reducer-based flow and the UI components.

**What gets harder**: one D1 database would hold all festivals, so one popular on-sale could slow another's writes. A database or a Durable Object per festival would isolate them. The seed also moves from a migration to a festival-creation step.

## Architecture decisions

See the ADR index: [docs/adr/README.md](docs/adr/README.md).
