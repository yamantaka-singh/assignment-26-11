# Deploying to production (Void on Cloudflare Workers)

The app is a Void app. `void deploy` builds it, provisions a Cloudflare D1 database, applies the SQL migrations in `db/migrations/`, and publishes a Worker with a public URL. There is no Vercel and no separate server: pages and `/api/*` routes are one Worker, and all state lives in D1.

Commands below use `npx void ...` (the installed `void` 1.11.0). Source for every claim: `node_modules/void/docs/` (`guide/deployment.md`, `reference/cli/deploy.md`, `reference/cli/database.md`, `integrations/cloudflare.md`, `guide/database/d1.md`, `guide/env-vars.md`).

## Prerequisites

- Node 26 (`export PATH=/opt/homebrew/opt/node@26/bin:$PATH` on the dev machine) and `npm install` already run.
- A free Cloudflare account. Workers Free is enough: no sandboxes, email or AI are used.
- `.void/project.json` says `"platform": "none"`, so the first deploy must name the platform explicitly: `--platform cloudflare`.

## First deploy

```sh
npm test && npm run build          # local gate
npx void db status                 # 2 migrations, both "local: applied"
npx void deploy --platform cloudflare
```

What the last command does, in order (docs: "What happens during deploy"):

1. Opens a browser to sign in to Cloudflare and asks which account to use (if the browser does not open, open the printed link and confirm the printed code). The choice is saved for later deploys.
2. Creates missing resources, here the D1 database and its binding, and records their IDs in `void.lock.json`.
3. Builds the app (the same `vp build` as `npm run build`).
4. Checks that the schema matches the committed migrations (it stops and asks for `void db generate` if not; it should not).
5. Applies pending migrations to the production D1 database: `20261124075636_lazy_stardust.sql` (tables and CHECK constraints) then `20261124075639_seed_stock_and_promos.sql` (the brief's stock and the five promo codes). Production therefore starts with `day-adult 380 ... garba 2`, and the promos `SEVA10`, `FLAT20`, `KIDSFREE`, `EXPIRED5`, `MAXEDOUT`. Before migrating, deploy saves a D1 Time Travel restore point and prints a `void db restore --bookmark ...` command. Keep that output.
6. Uploads the Worker, runs a readiness check, then sends it traffic. If readiness fails, the previous deployment is restored.

The summary box prints the production URL (a `*.workers.dev` address). That is the link to submit.

Afterwards, commit the lock file (it is not gitignored, and it pins the D1 database ID so a later deploy from another machine reuses the same database instead of creating a new empty one):

```sh
git add void.lock.json && git commit -m "chore: record void deploy lock"
```

Later deploys (`npx void deploy`) reuse the saved target. Use `--platform cloudflare` again if the CLI asks.

## Verify production

Set `URL` to the printed address.

```sh
URL=https://<worker>.<subdomain>.workers.dev

# 1. Site opens with no login or password (expect 200 and HTML)
curl -s -o /dev/null -w '%{http_code}\n' "$URL/"

# 2. Catalog reads from D1 and shows the seed (day-adult remaining 380, garba 2, allday-adult sold out)
curl -s "$URL/api/catalog" | python3 -m json.tool | grep -E '"(id|remaining|soldOut)"'

# 3. One real booking: 1 adult, Day Pass Nov 10, $15, approved test card, with an Idempotency-Key
KEY=deploy-check-$(date +%s)
BODY='{"booking":{"booker":{"name":"Deploy Check","email":"check@example.com","phone":"214-555-0101","age":38,"attending":true},"attendees":[{"id":"a1","name":"Deploy Check","age":38,"ticket":{"kind":"day","days":["2026-11-10"]},"dinnerDays":[],"garbaDays":[]}],"familyPasses":[],"dandiyaQty":0},"payment":{"cardNumber":"4242 4242 4242 4242"}}'
curl -s -w '\nHTTP %{http_code}\n' -X POST "$URL/api/bookings" -H 'content-type: application/json' -H "Idempotency-Key: $KEY" -d "$BODY"
# expect HTTP 201 with bookingId, reference (SU26-XXXXXX), amountCents 1500

# 4. Same key again: expect HTTP 200 and the SAME bookingId (a replay, no second decrement)
curl -s -w '\nHTTP %{http_code}\n' -X POST "$URL/api/bookings" -H 'content-type: application/json' -H "Idempotency-Key: $KEY" -d "$BODY"

# 5. Stock moved by exactly one: day-adult remaining 379
curl -s "$URL/api/catalog" | python3 -m json.tool | grep -A3 '"day-adult"'
```

Do not spend the Garba Workshop in these checks: only 2 places exist and they are the demo for the sold-out and race cases.

Persistence ("a booking at 9am is still there at 9pm"): the Worker keeps nothing in memory between requests. Every count is a row in D1, which is durable storage, and a booking is one `db.batch` transaction (insert plus stock decrements, protected by `CHECK remaining >= 0`). To confirm, note the day-adult figure after step 5, then repeat step 5 hours later, from a phone on mobile data or another network, and in a private window. The number must be unchanged and the booking must still resolve: `curl -s "$URL/api/bookings/<bookingId>"`.

Remote data without the UI (read-only): `npx void db execute --remote "SELECT item_id, remaining FROM inventory"` and `... "SELECT reference, amount_cents, created_at FROM bookings"`. Never run an `UPDATE` there (see "Resetting stock").

### Logs and status

```sh
npx void project status                          # Worker versions, which is active, migrations recorded
npx void project logs --level error              # live tail of errors (Cloudflare targets tail live, no history)
npx void project logs --filter "/api/bookings"   # live tail, substring match
```

Cloudflare targets give a live tail only: run the command, then trigger the request. Handlers log only the error message, never request bodies, so card numbers are not in the logs.

## D1 read replication: stock is read from the primary

- Setting: `database: { readReplication: false }` in `void.config.ts` (added for this runbook; it was previously unset).
- Why it matters: with replication on, a read in a new request can be served by a lagging replica, so `/api/catalog` could show stock from before the last booking, and the pre-check before a booking could use stale stock. The docs say so: "Replicas can lag between requests" (`guide/database/d1.md#read-replication`).
- What the docs say about the default: replication is opt-in, and a new database defaults to off. If the option is omitted, deploy leaves an existing database's setting unchanged. A database that was ever deployed with replication on stays on until it is explicitly set to `false` and deployed. Setting it explicitly makes the intent visible and also covers a database that already existed. This is a fresh database, so the result is the same either way.
- With replication off every query goes to the single primary, so a read after a write sees the write, in the same request and in the next one. No bookmark or `first-primary` session is needed, and none is used.
- Writes are never served by replicas. Booking correctness also does not rest on reads: the commit is one transaction that fails on the `CHECK` constraint if stock would go negative (see `docs/notes/concurrency-check.md`).
- Re-enabling replication later would need bookmark handling for `/api/catalog` and the booking flow. Do not turn it on without that.

## Environment variables and secrets

None are needed. There is no `env.ts`, nothing reads `process.env` or `void/env`, the payment step is simulated (`src/server/payment.ts`, test cards only), and the database is reached through the D1 binding that deploy creates. `.env*` is gitignored (and `.env.example` is allowed) and no secret is committed.

If one is ever added: declare it in `env.ts` with `defineEnv`, then `npx void secret put NAME` (or `void secret sync file`) for production, and `npx void env check --remote`. Deploy never uploads a local `.env`. Public `VITE_*` values are not secrets and are supplied in the build shell.

## Rollback and redeploy

```sh
npx void project status            # list Worker versions, find the previous one
npx void project rollback          # activates the chosen version at 100%
npx void deploy                    # redeploy the current checkout (pending migrations only)
```

Rollback changes code only. It does not undo database changes, and the schema has no destructive migrations here, so the older code works with the current schema. If a migration itself was bad, use the restore point printed at deploy: `npx void db restore --bookmark <bookmark>` (Time Travel: 7 days on Free). A restore discards every write after that point, including bookings, so treat it as a last resort and fix the migration before deploying again.

## Resetting stock in production

Never edit the production database by hand, and never `void db reset` against production (reset is local-only). To change production stock or promo data, add a new migration so the change is versioned, reviewed and applied by `void deploy`:

1. Add `db/migrations/<timestamp>_reset_stock.sql` with a later timestamp than the existing files, for example:

   ```sql
   -- Put garba and day-adult back to the brief's figures after demo bookings.
   UPDATE `inventory` SET `remaining` = 2 WHERE `item_id` = 'garba';--> statement-breakpoint
   UPDATE `inventory` SET `remaining` = 380 WHERE `item_id` = 'day-adult';--> statement-breakpoint
   UPDATE `promo_codes` SET `uses` = 0 WHERE `code` IN ('SEVA10', 'FLAT20', 'KIDSFREE');
   ```

2. Register it exactly like the seed migration did: add one entry to `db/migrations/meta/_journal.json` (next `idx`, `"version": "6"`, a larger `when`, `tag` = file name without `.sql`, `"breakpoints": true`) and copy the latest `meta/*_snapshot.json` to `meta/<timestamp>_snapshot.json` (a data-only change leaves the schema snapshot identical).
3. Check locally: `npx void db reset --yes && npx void db status` (3 migrations applied) and `npm test`.
4. Commit and `npx void deploy`.

This example was written from the docs and the existing journal format and has not been run. Do the local check in step 3 first. Note that this resets counters only; the `bookings` rows stay, which is intended (they are the record). Do not edit the seed migration: it has already been applied in production, and `tests/seed-migration.test.ts` guards that it matches the catalog.

## Pre-submission checklist (brief section 7, for Void)

- [ ] Production URL (the `*.workers.dev` address printed by `void deploy`) is the one submitted. `void deploy` on this target publishes one live Worker, so the URL does not expire like a preview.
- [ ] `curl -I $URL/` returns 200 with no login or password wall (also open it in a private window).
- [ ] Build passed in the deploy itself: `void deploy` builds and runs a readiness check, and finished with the summary box (`npx void project status` shows the new version active).
- [ ] No environment variables are required (see above); nothing to set in a dashboard.
- [ ] No secrets committed: `git ls-files | grep -E '\.env'` shows only `.env.example` if it exists; `git grep -n -iE 'api[_-]?key|secret|token' -- . ':!package-lock.json'` finds nothing real.
- [ ] Data layer works in production: curl checks 2 to 5 above pass, replication is off (`void.config.ts`), and day-adult is unchanged when re-checked hours later from another network.
- [ ] `void.lock.json` is committed.
- [ ] Deployment stays live until the interview ends: do not run `void project delete`, delete the Worker or D1 database in the Cloudflare dashboard, or rotate the account. Workers Free has no expiry.
