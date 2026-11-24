# Concurrency check (local D1, real HTTP)

Goal: prove two people racing for the last 2 Garba Workshop places cannot both succeed, and that a
double-submit cannot book twice. This is a manual check against the running dev server, not a unit test:
the unit tests use an in-memory repository, so only this run exercises D1's `CHECK` constraints and
`db.batch` transaction.

Setup for every experiment (the dev server must be restarted after a DB reset, otherwise it keeps serving
the old state):

```sh
export PATH=/opt/homebrew/opt/node@26/bin:$PATH
pkill -f "vp dev"; npx void db reset --yes     # fresh DB: migrations + seed (garba=2, day-adult=380)
npm run dev &                                   # http://localhost:5173
```

`garba2.json` is one booking: two adults (Meera, Raj) on a Nov 11 Day Pass, each with a Garba Workshop
on Nov 11, paying with the approved test card. `garba1.json` is the same with only Meera.
Total $70.00 for `garba2.json`.

## 1. Two simultaneous bookings for 2 seats each (different keys)

```sh
curl -s localhost:5173/api/catalog          # garba remaining: 2
curl -s -X POST localhost:5173/api/bookings -H 'content-type: application/json' \
  -H 'Idempotency-Key: race-key-A-0001' -d @garba2.json &
curl -s -X POST localhost:5173/api/bookings -H 'content-type: application/json' \
  -H 'Idempotency-Key: race-key-B-0002' -d @garba2.json &
wait
```

Observed:

```
{'day-adult': 380, 'garba': 2}
HTTP 409 {"error": {"code": "SOLD_OUT", "message": "Garba Workshop is sold out.", "fields": [{"code": "SOLD_OUT", "path": "stock.garba", "message": "Garba Workshop is sold out."}]}}
HTTP 201 {"bookingId": "a3c5a046-81ba-431e-b35f-51ea6b20959c", "reference": "SU26-74T6GS", "amountCents": 7000}
after:  {'day-adult': 378, 'garba': 0}
select count(*) from bookings  ->  1
```

Exactly one 201 and one 409; garba is 0 and not negative; `day-adult` dropped by 2 (the winner's), so the
loser took nothing.

## 2. Six simultaneous bookings, 1 seat each (6 different keys, 2 seats available)

```
request 1 HTTP 201    request 4 HTTP 409
request 2 HTTP 409    request 5 HTTP 409
request 3 HTTP 201    request 6 HTTP 409
after:  {'day-adult': 378, 'garba': 0}
```

Two winners, four losers. `day-adult` is 378, i.e. 380 minus the two winners only: a losing request that
got as far as the commit batch left no partial decrement behind.

## 3. Three simultaneous bookings with the SAME key (double-click / retry storm)

```
request 1 HTTP 200    request 2 HTTP 201    request 3 HTTP 200
after:  {'day-adult': 378, 'garba': 0}
select count(*) from bookings  ->  1
```

One booking, one stock decrement. The `200`s are replays that returned the stored booking (same `bookingId`).

## 4. The constraint itself

```sh
npx void db execute "UPDATE inventory SET remaining = remaining - 3 WHERE item_id='garba'"
# ■ CHECK constraint failed: inventory_remaining_non_negative
```

## Honest limits

- The HTTP responses cannot tell whether a 409 came from the stock pre-check (the other request had already
  committed) or from the `CHECK` failing inside the batch. Local requests are fast enough that both happen.
  The commit-time path is covered separately by unit tests that feed the service stale stock
  (`tests/api-bookings.test.ts`, "stock vanishes between the check and the commit"), and the constraint
  is shown directly in section 4.
- This is local D1 (miniflare/SQLite). Production D1 batches are also transactional, but this run does not
  prove that against Cloudflare.

## Reset

After the experiments: `pkill -f "vp dev"; npx void db reset --yes`, which restores seed values
(`garba=2`, `day-adult=380`, `allday-adult=0`, 0 bookings).
