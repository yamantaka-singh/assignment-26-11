// The real Repo over D1 via void/db. Everything that must be atomic is ONE db.batch (a D1 transaction).
import { bookings, inventory, promoCodes } from '@schema';
import { db, eq, sql, type BatchItem } from 'void/db';
import { ITEM_IDS, PROMO_CODES, type ItemId, type PromoCode } from '../domain/catalog';
import type { PromoRecord } from '../domain/types';
import type { BookingRecord, CommitResult, NewBooking, Repo } from './repo';
import { parseStoredBooking } from './stored';

// Constraint names from db/schema.ts. A failed CHECK rolls back the whole batch.
const STOCK_CHECK = 'inventory_remaining_non_negative';
const PROMO_CHECK = 'promo_uses_within_max';
const DUPLICATE_KEY = 'bookings.idempotency_key';

/** Driver errors arrive wrapped; the constraint name lives somewhere down the cause chain. */
function errorText(err: unknown): string {
  const parts: string[] = [];
  for (let e: unknown = err, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) parts.push(e.message);
  return parts.join(' | ');
}

const isPromoCode = (code: string): code is PromoCode => PROMO_CODES.some((c) => c === code);
const isPromoKind = (kind: string): kind is PromoRecord['kind'] => kind === 'percent' || kind === 'flat' || kind === 'kids-free';

function toPromoRecord(row: typeof promoCodes.$inferSelect): PromoRecord | undefined {
  if (!isPromoCode(row.code) || !isPromoKind(row.kind)) return undefined;
  return { code: row.code, kind: row.kind, value: row.value, expiresAt: row.expiresAt, maxUses: row.maxUses, uses: row.uses };
}

function toBookingRecord(row: typeof bookings.$inferSelect): BookingRecord {
  return {
    id: row.id,
    reference: row.reference,
    idempotencyKey: row.idempotencyKey,
    requestHash: row.requestHash,
    ...parseStoredBooking(row),
    amountCents: row.amountCents,
    status: 'confirmed',
    createdAt: row.createdAt,
  };
}

function writesFor(b: NewBooking): [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] {
  const stock = ITEM_IDS.flatMap((id: ItemId) => {
    const qty = b.quote.stockNeeded[id] ?? 0;
    return qty > 0
      ? [db.update(inventory).set({ remaining: sql`${inventory.remaining} - ${qty}` }).where(eq(inventory.itemId, id))]
      : [];
  });
  const promo =
    b.quote.promo.status === 'applied'
      ? [db.update(promoCodes).set({ uses: sql`${promoCodes.uses} + 1` }).where(eq(promoCodes.code, b.quote.promo.code))]
      : [];
  const insert = db.insert(bookings).values({
    id: b.id,
    reference: b.reference,
    idempotencyKey: b.idempotencyKey,
    requestHash: b.requestHash,
    bookerJson: JSON.stringify(b.booker),
    attendeesJson: JSON.stringify(b.attendees),
    quoteJson: JSON.stringify(b.quote),
    amountCents: b.amountCents,
    status: b.status,
  });
  return [insert, ...stock, ...promo];
}

export const d1Repo: Repo = {
  async getInventory() {
    const rows = await db.select().from(inventory).all();
    return Object.fromEntries(rows.map((r) => [r.itemId, r.remaining]));
  },

  async getPromo(code) {
    const row = await db.select().from(promoCodes).where(eq(promoCodes.code, code)).get();
    return row ? toPromoRecord(row) : undefined;
  },

  async findBookingByIdempotencyKey(key) {
    const row = await db.select().from(bookings).where(eq(bookings.idempotencyKey, key)).get();
    return row ? toBookingRecord(row) : undefined;
  },

  async getBooking(id) {
    const row = await db.select().from(bookings).where(eq(bookings.id, id)).get();
    return row ? toBookingRecord(row) : undefined;
  },

  async commitBooking(booking): Promise<CommitResult> {
    try {
      await db.batch(writesFor(booking));
      return { kind: 'created' };
    } catch (err) {
      const text = errorText(err);
      if (text.includes(STOCK_CHECK)) return { kind: 'stock-conflict' };
      if (text.includes(PROMO_CHECK)) return { kind: 'promo-conflict' };
      if (text.includes(DUPLICATE_KEY)) return { kind: 'duplicate-key' };
      throw err;
    }
  },
};
