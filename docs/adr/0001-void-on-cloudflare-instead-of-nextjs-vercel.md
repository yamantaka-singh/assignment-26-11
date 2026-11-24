# ADR-0001: Void on Cloudflare Workers instead of Next.js on Vercel

**Date**: 2026-11-24
**Status**: accepted
**Deciders**: the author (explicit decision)

## Context

The brief asks for a Next.js app (or small service) deployed on the author's own Vercel account, with the production Vercel URL at the top of the README (sections 6, 7, 9). The author chose to develop and deploy on void.cloud only. Void is a Vite + Hono framework that targets Cloudflare Workers, with D1 (SQLite) as its database.

`DESIGN.md` (written first) proposed a thin Vercel project that rewrites every path to the Workers app, so the reviewer would still get a `*.vercel.app` URL. That idea was dropped the same day (see Alternatives).

## Decision

Build and deploy on Void only. The live URL is a `*.workers.dev` address. There is no Next.js, no Vercel project and no Vercel build.

Why Void:

- **One CLI for everything.** `void db migrate`, `void db execute`, and `void deploy` handle the database, schema changes and release. No separate Neon/Supabase account, connection strings or secrets to copy into a dashboard.
- **D1 gives real SQL constraints.** Stock correctness rests on a `CHECK (remaining >= 0)` and an atomic `db.batch` (ADR-0004). D1 is also persistent, which satisfies brief section 7 rule 6 (a booking at 9am is still counted at 9pm).
- **Workers run at the edge with no cold-start container.** Request handlers are plain `Request` -> `Response` functions, which suits thin API routes.

## Alternatives considered

### Alternative 1: Next.js route handlers on Vercel with Neon or Supabase Postgres (the brief's path)
- **Pros**: exactly what the reviewers asked for; they can run the same stack locally.
- **Cons**: three accounts (Vercel, database vendor, GitHub), connection pooling for serverless, env vars to set in a dashboard.
- **Why not**: the author decided against it. One CLI and one deploy target were judged worth more than matching the stack in the brief.

### Alternative 2: Void app plus a Vercel project that rewrites all paths to Workers
- **Pros**: the reviewer still gets a Vercel URL.
- **Cons**: an extra hop and an extra moving part. The "Vercel build" would build nothing. It would look like compliance without being it.
- **Why not**: dropped the same day. Better to state the deviation plainly than to wrap it.

## Consequences

### Positive
- One deploy path to document (`docs/DEPLOY.md`) and one place for stock to live.
- Constraint-based stock safety, tested locally against real D1 (`docs/notes/concurrency-check.md`).

### Negative
- The brief's checklist items about Vercel (production URL on vercel.app, "build passed on Vercel", env vars in the Vercel dashboard) do not apply. A reviewer who expects them will see a deviation.
- Void 1.11 is young. Its documentation and community are far smaller than Next.js's, and a reviewer may not know it.
- The interview's "add a rule live" step is unaffected: rules live in `src/domain/`, which has no framework imports.

### Risks
- **The reviewer may reject the deviation outright.** Mitigation: this ADR and the README say so at the top.
- **A port to Next.js would be needed if requested.** Mitigation: the domain core and services depend only on a `Repo` interface (`src/server/repo.ts`). A port would replace the four files in `routes/api/` and `src/server/d1-repo.ts`. The stock guard would become a transaction with `UPDATE ... WHERE remaining >= n` on Postgres. The rules, pricing, validation and tests would not change.
