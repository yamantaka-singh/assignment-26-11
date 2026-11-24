# Sharad Utsav 2026 Booking — Implementation Plan

> **For Claude:** Execute subagent-driven. Each task names its **special skill**; every subagent also loads `ponytail` (full) and reads Void's skill at `node_modules/void/skills/void/SKILL.md` (fallback `~/projects/voidzero-dev-void/packages/void/skills/void/SKILL.md`) before touching Void APIs, preferring docs in `node_modules/void/docs/`. Model: Sonnet, effort high.

**Goal:** A family books festival tickets in one go, pays (simulated), and gets a confirmation. The server owns every price, rule and stock count.

**Architecture:** A Void "SPA + API" app on Cloudflare Workers. `src/domain/` holds the pure business rules (catalog, ages, pricing, promos) with no framework imports, and both the server and the UI import it. `routes/api/*` are thin Void handlers: they validate with zod, call the domain, and persist to D1. Stock and promo-usage limits are enforced by SQLite `CHECK` constraints inside one atomic `db.batch`, so two people racing for the last workshop seat cannot both succeed. The React UI is a single `useReducer` state machine that never computes the payable total: it shows the server's `/api/quote` result.

**Tech stack:** Void 1.11 (Vite+, Hono under the hood), React, D1 (SQLite) + Drizzle, zod, Vitest via `vp test`, plain CSS with brand tokens. Deployed on Void (Cloudflare) only.

**Decision log (user, 2026-11-24):** build on Void and add a thin Vercel mirror (ADR-0001). **Revised same day:** Void only, no Vercel mirror; README records the change from DESIGN.md. Work stays local: the user pushes to GitHub and runs the deploy.

---

## Execution map

```
T0 scaffold + domain types + DESIGN.md  (sequential, orchestrator)
        │
        ├── T1 pricing + promo engine     ─┐  parallel wave 1
        ├── T2 age rules + request schema  ├─ (disjoint files)
        └── T3 UI shell + design tokens   ─┘
        │
        T4 D1 schema, migrations, API routes   (needs T1+T2)
        │
        T5 wire UI to API, booking flow end to end   (needs T3+T4)
        │
        ├── T6 ADRs + README + API contract   ─┐  parallel wave 2
        ├── T7 TEST-CASES.md + edge-case tests  ├─ (disjoint files)
        └── T8 Void deploy runbook           ─┘
        │
        T9 verification-loop (orchestrator)
```

Every task ends with tests and typecheck green, plus a small conventional commit (`git add <own files>` only — never `git add -A`, other agents share the tree). **No `any`, no `as` casts**, money only as integer cents.

---

## Domain decisions (the "left open on purpose" cases — every task must honour these)

| # | Gap in the brief | Decision |
|---|---|---|
| D1 | Under-5s need no ticket, but do the volunteers need them? | Collected as attendees (first name only, age) at $0 so the door headcount is right. They can have a dinner plate. |
| D2 | Family Pass "covers 2 adults and 2 children": what about 2A+1C, or 3 kids? | One pass covers **up to** 2 adults (12+) and **up to** 2 children (5–11) on one chosen day, at least 1 adult. Under-5s ride along free. The server adds a hint when per-person tickets would be cheaper (e.g. 1A+1C = $23 vs $40). It never auto-switches. |
| D3 | All-Day Adult is sold out | Shown as sold out. The hint suggests 5 Day Passes ($75). |
| D4 | 5 Day Passes cost more than an All-Day Pass (child: $40 vs $30) | Non-blocking "cheaper option" hint from the server. |
| D5 | Garba Workshop stock of 2: per session or a shared pool? | One shared pool of 2 across Nov 11 + 13 (that is what the stock table says). The attendee must hold entry for that day. Max 1 workshop per person per session. |
| D6 | Dinner plate "per person, per day": for which days? | Only for days the person has entry (any band, toddlers included). |
| D7 | Is the booker attending? | Checkbox. If attending, the booker is attendee #1 with age ≥ 18. The booker's own age must be ≥ 18 either way. |
| D8 | Children with no adult in the group | At least one attendee aged 18+ is required whenever anyone under 12 attends. |
| D9 | Age measured when? | Age **on the first festival day (10 Nov 2026)**, as a whole number 0–120. A child turning 12 mid-festival stays a child: this is simpler and favours the family. |
| D10 | Promo stacking and floor | One code per booking, case-insensitive, trimmed. FLAT20 floors the total at $0. SEVA10 = 10% of the subtotal incl. extras, rounded half-up to the cent. KIDSFREE zeroes child entry lines only (day + all-day child), not the Family Pass or extras; if the group has no child tickets it says so. Unknown/expired/maxed codes give distinct friendly messages, and the booking proceeds without a discount. |
| D11 | $0 total (e.g. KIDSFREE on kids only, FLAT20 on a $15 order) | Payment step skipped. The booking is confirmed with `amountCents: 0`. |
| D12 | Day Pass stock unit | 1 unit = 1 person-day. A Family Pass consumes 1 Family Pass unit, not day-pass stock. |
| D13 | Festival is already over (today is 24 Nov 2026) | **Left unhandled on purpose:** no sales-window cutoff, so reviewers can use the live site. Noted in the README. `EXPIRED5` expired 2026-10-31. |
| D14 | Dandiya quantity | 0–20 per booking (booking-level, not per person). Group size 1–20 attendees. |
| D15 | Double-click on Pay / retried request | Client sends an `Idempotency-Key` (UUID per checkout attempt). `bookings.idempotency_key` is UNIQUE, and a replay returns the original booking. The button is disabled while in flight. |
| D16 | Payment vs stock ordering | Simulated payment: test card `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` declines (no stock touched); no card data stored. Stock decrement + booking insert + promo use run in **one D1 batch**. With real Stripe: authorise → batch → capture, cancel the auth on stock failure (ADR-0006). |

---

### Task 0: Scaffold, shared types, DESIGN.md (orchestrator, sequential)

**Files:** project root, `src/domain/catalog.ts`, `src/domain/types.ts`, `src/domain/api.ts`, `DESIGN.md`, `.gitignore`

1. `brew upgrade node@26`, then `export PATH=/opt/homebrew/opt/node@26/bin:$PATH` and confirm `node -v` ≥ 26.12.
2. `git init -b main` in `/Users/kaalu/projects/assignment-26-11` (the parent `~/projects` repo must not swallow it).
3. Commit `DESIGN.md` **first, alone** (`docs: design note before coding`). The brief requires it in the candidate's own words, so the user should rewrite it in their own voice before pushing.
4. `npx void init --toolchain vite-plus --framework react --starter sqlite --deploy none`, then add `zod`. Commit `chore: scaffold void app`.
5. Write the shared types: ids are string-literal unions, rules key off ids/kinds and never off labels. Commit `feat: domain catalog and types`.

### Task 1: Pricing + promo engine — skill `tdd-workflow`

**Files:** `src/domain/pricing.ts`, `src/domain/promo.ts`, `tests/pricing.test.ts`, `tests/promo.test.ts`

- `priceBooking(booking: ValidBooking, promo: PromoResult): Quote` returns lines `{ itemId, attendeeId?, day?, qty, unitCents, totalCents }`, `subtotalCents`, `discountCents`, `totalCents`, and `hints`.
- `evaluatePromo(code, now, promoRecord | undefined): PromoResult` is a discriminated union: `applied | unknown | expired | exhausted`.
- TDD: write the failing test first. Cover every D2/D4/D10/D11 row, rounding (`SEVA10` on $14.65 → $1.47 off), the FLAT20 floor, KIDSFREE with mixed groups, and the guard that every cent value is an integer.

### Task 2: Age rules + request schema — skill `zod-validation-expert`

**Files:** `src/domain/eligibility.ts`, `src/domain/schema.ts`, `tests/eligibility.test.ts`, `tests/schema.test.ts`

- `ageBand(age): 'toddler' | 'child' | 'adult'`. `validateBooking(input: unknown): Result<ValidBooking, RuleError[]>` with field paths, so the UI can put each message next to its field.
- The zod schema parses unknown JSON: integers only, ages 0–120, trimmed names ≤ 80, email, phone, a day enum, unique attendee ids, ticket holders matching attendees (D1), family pass membership (D2), workshop/dinner days ⊆ entry days (D5/D6), D7/D8, quantity caps (D14). It rejects unknown keys (`.strict()`) and so any client-supplied price.
- Tests: "7-year-old on an adult ticket", "17-year-old booker", "age '12abc' / -1 / 3.5 / 999", "price field injected", "attendee removed but their dinner plate kept".

### Task 3: UI shell + tokens — skill `frontend-a11y`

**Files:** `src/ui/theme.css`, `src/ui/components/*.tsx` (Field, Stepper, MoneyText, Notice, Button)

- Brand tokens as CSS custom properties. Check contrast and record the ratios in a comment. Serif headings (one Google Font), system sans body.
- Every control is labelled, errors use `aria-describedby`, focus rings are visible, touch targets are ≥ 44px, it works at 360px width, and it respects `prefers-reduced-motion`.
- No business logic in this task. `MoneyText` formats cents with `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`.

### Task 4: D1 + API routes — skill `api-design` (after T1, T2)

**Files:** `db/schema.ts`, `db/migrations/*` (incl. a hand-written seed migration so production gets stock + promos), `src/server/*.ts`, `routes/api/catalog.ts`, `routes/api/quote.ts`, `routes/api/bookings/index.ts`, `routes/api/bookings/[id].ts`, `tests/bookings.test.ts` (mock `void/db`)

| Method | Path | Body | Success |
|---|---|---|---|
| GET | `/api/catalog` | — | event, days, items (price, band, valid days, remaining, soldOut) |
| POST | `/api/quote` | `BookingRequest` + `promoCode?` | `Quote` + `promo` status, or `422 { error }` with field errors |
| POST | `/api/bookings` | `BookingRequest` + `promoCode?` + `payment?: { cardNumber }`, header `Idempotency-Key` | `201 { bookingId, reference, amountCents, quote }`; replay → `200` same body; `402` declined; `409 SOLD_OUT {itemId}`; `422` rules |
| GET | `/api/bookings/:id` | — | confirmation view (no card data stored) |

- Tables: `inventory(item_id PK, remaining INTEGER NOT NULL CHECK (remaining >= 0))`, `promo_codes(code PK, kind, value, expires_at, max_uses, uses CHECK (uses <= max_uses))`, `bookings(id, reference, idempotency_key UNIQUE, booker_json, attendees_json, quote_json, amount_cents, created_at)`.
- Atomicity: `db.batch([decrement per item, promo use, insert booking])`. A CHECK violation rolls the whole batch back and maps to 409. Re-validate, re-read stock and re-price inside the request: never trust the quote the client saw.
- Errors use one envelope: `{ error: { code, message, fields? } }`.

### Task 5: Booking flow — skill `frontend-a11y` (after T3, T4)

**Files:** `src/booking/machine.ts` (+ `tests/machine.test.ts`), `src/booking/steps/*.tsx`, `src/App.tsx`, `src/api/client.ts`

- The reducer has states `group → tickets → extras → review → paying → confirmed | failed`. Its actions keep attendee count and ticket holders in sync: removing a person drops their tickets/extras, and a changed age re-bands and clears tickets that no longer fit.
- Quote: debounced `POST /api/quote` on every change. It shows a loading state, shows the server's errors per field, and an offline banner + retry.
- Pay generates the idempotency key once per review entry and disables the button while in flight. Sold-out (409) sends the user back with the item marked.

### Task 6: ADRs + README — skill `architecture-decision-records`

**Files:** `docs/adr/0001…0007-*.md`, `README.md`

README: live URLs at the top (placeholders until deploy), run locally, env vars, the API contract table, **Decisions I made** (D1–D16), **Unfinished** stated plainly, and "ten festivals" notes.

### Task 7: TEST-CASES.md — skill `qa-test-planner`

**Files:** `TEST-CASES.md`, `tests/edge-cases.test.ts`

A table of situation → expected → where it is enforced → test name.

### Task 8: Void deploy runbook — skill `void` (bundled)

**Files:** `docs/DEPLOY.md`. Covers `void deploy`, migrations-in-prod (seed migration), env vars, rollback, and how to check that stock persists across requests and over time (brief §7 rule 6). No Vercel.

### Task 9: Verification — skill `verification-loop` (orchestrator)

Build, types, tests, a grep for `any`/`as `/`console.log`/secrets, an API smoke run against the dev server (good booking, 7-year-old adult ticket, tampered price, two concurrent workshop bookings, replayed key), and a 360px browser pass.
