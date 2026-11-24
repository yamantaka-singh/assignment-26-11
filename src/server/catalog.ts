import { CATALOG, FESTIVAL, FESTIVAL_DAYS, GARBA_DAYS, ITEM_IDS } from '../domain/catalog';
import { remainingOf, type Repo } from './repo';

export async function catalogView(repo: Pick<Repo, 'getInventory'>) {
  const inventory = await repo.getInventory();
  return {
    event: FESTIVAL,
    days: FESTIVAL_DAYS,
    garbaDays: GARBA_DAYS,
    items: ITEM_IDS.map((id) => {
      const { label, priceCents, unit } = CATALOG[id];
      const remaining = remainingOf(inventory, id);
      return { id, label, priceCents, unit, remaining, soldOut: remaining <= 0 };
    }),
  };
}
