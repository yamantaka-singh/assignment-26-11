import { sql } from 'void/db';
import { check, integer, sqliteTable, text } from 'void/schema-d1';

// Stock lives here. CHECK (remaining >= 0) is what makes an oversell fail the whole booking batch.
export const inventory = sqliteTable(
  'inventory',
  {
    itemId: text('item_id').primaryKey(),
    remaining: integer('remaining').notNull(),
  },
  (t) => [check('inventory_remaining_non_negative', sql`${t.remaining} >= 0`)],
);

export const promoCodes = sqliteTable(
  'promo_codes',
  {
    code: text('code').primaryKey(),
    kind: text('kind').notNull(),
    value: integer('value').notNull(),
    expiresAt: text('expires_at'),
    maxUses: integer('max_uses'),
    uses: integer('uses').notNull().default(0),
  },
  (t) => [check('promo_uses_within_max', sql`${t.maxUses} IS NULL OR ${t.uses} <= ${t.maxUses}`)],
);

// card data is never stored: only the booking, its server-priced quote and a hash of the request.
export const bookings = sqliteTable('bookings', {
  id: text('id').primaryKey(),
  reference: text('reference').notNull().unique(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  requestHash: text('request_hash').notNull(),
  bookerJson: text('booker_json').notNull(),
  attendeesJson: text('attendees_json').notNull(),
  quoteJson: text('quote_json').notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
