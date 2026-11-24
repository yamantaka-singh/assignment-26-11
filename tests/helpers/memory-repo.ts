// An in-memory Repo with the same all-or-nothing commit as the D1 batch: check everything, then apply.
import { CATALOG, ITEM_IDS } from '../../src/domain/catalog';
import { PROMO_SEED } from '../../src/domain/promo';
import type { PromoRecord } from '../../src/domain/types';
import type { BookingRecord, CommitResult, NewBooking, Repo } from '../../src/server/repo';

export interface MemoryRepo extends Repo {
  readonly inventory: Record<string, number>;
  readonly promos: Map<string, PromoRecord>;
  readonly bookings: Map<string, BookingRecord>;
}

export function memoryRepo(): MemoryRepo {
  const inventory: Record<string, number> = Object.fromEntries(ITEM_IDS.map((id) => [id, CATALOG[id].initialStock]));
  const promos = new Map<string, PromoRecord>(PROMO_SEED.map((p) => [p.code, { ...p }]));
  const bookings = new Map<string, BookingRecord>(); // by id
  const byKey = (key: string) => [...bookings.values()].find((b) => b.idempotencyKey === key);

  return {
    inventory,
    promos,
    bookings,
    async getInventory() {
      return { ...inventory };
    },
    async getPromo(code) {
      const p = promos.get(code);
      return p && { ...p };
    },
    async findBookingByIdempotencyKey(key) {
      return byKey(key);
    },
    async getBooking(id) {
      return bookings.get(id);
    },
    async commitBooking(b: NewBooking): Promise<CommitResult> {
      if (byKey(b.idempotencyKey)) return { kind: 'duplicate-key' };
      const needed = Object.entries(b.quote.stockNeeded);
      if (needed.some(([id, qty]) => (inventory[id] ?? 0) - qty < 0)) return { kind: 'stock-conflict' };
      const promo = b.quote.promo.status === 'applied' ? promos.get(b.quote.promo.code) : undefined;
      if (promo && promo.maxUses !== null && promo.uses + 1 > promo.maxUses) return { kind: 'promo-conflict' };
      for (const [id, qty] of needed) inventory[id] = (inventory[id] ?? 0) - qty;
      if (promo) promos.set(promo.code, { ...promo, uses: promo.uses + 1 });
      bookings.set(b.id, { ...b, createdAt: '2026-11-24T12:00:00.000Z' });
      return { kind: 'created' };
    },
  };
}
