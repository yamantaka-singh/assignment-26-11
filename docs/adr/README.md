# Architecture Decision Records

Short records of the decisions that shape this codebase. Format: Context, Decision, Alternatives considered, Consequences. All dated 2026-11-24.

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0000](0000-record-architecture-decisions.md) | Record architecture decisions | accepted | 2026-11-24 |
| [0001](0001-void-on-cloudflare-instead-of-nextjs-vercel.md) | Void on Cloudflare Workers instead of Next.js on Vercel | accepted | 2026-11-24 |
| [0002](0002-pure-domain-core.md) | Pure domain core, thin routes, injectable repository | accepted | 2026-11-24 |
| [0003](0003-integer-cents.md) | Money is integer cents everywhere | accepted | 2026-11-24 |
| [0004](0004-stock-via-check-constraints-in-one-batch.md) | Stock is guarded by CHECK constraints inside one atomic batch | accepted | 2026-11-24 |
| [0005](0005-idempotent-booking-creation.md) | Idempotent booking creation with a client key and a request hash | accepted | 2026-11-24 |
| [0006](0006-simulated-payment-and-stripe-path.md) | Simulated payment now, authorise-reserve-capture when Stripe is added | accepted | 2026-11-24 |
| [0007](0007-age-measured-on-first-festival-day.md) | Age is a whole number measured on the first festival day | accepted | 2026-11-24 |
| [0008](0008-reducer-state-machine-for-booking-flow.md) | The booking flow is a pure reducer state machine | accepted | 2026-11-24 |
| [0009](0009-server-quote-is-the-only-total.md) | The server's quote is the only total that exists | accepted | 2026-11-24 |

`DESIGN.md` at the repo root is the pre-coding note and is intentionally unedited. The README section "How the plan changed" lists where the code differs from it.
