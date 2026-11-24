// Turns "this booking needs more than we have" into messages a person can act on.
import { CATALOG, ITEM_IDS, type ItemId } from '../domain/catalog';
import type { Quote, RuleError } from '../domain/types';
import { remainingOf } from './repo';

const NOUN: Readonly<Record<ItemId, readonly [one: string, many: string]>> = {
  'day-adult': ['Adult Day Pass day', 'Adult Day Pass days'],
  'day-child': ['Child Day Pass day', 'Child Day Pass days'],
  'allday-adult': ['Adult All-Day Pass', 'Adult All-Day Passes'],
  'allday-child': ['Child All-Day Pass', 'Child All-Day Passes'],
  family: ['Family Pass', 'Family Passes'],
  dandiya: ['pair of Dandiya Sticks', 'pairs of Dandiya Sticks'],
  dinner: ['Dinner Plate', 'Dinner Plates'],
  garba: ['Garba Workshop place', 'Garba Workshop places'],
};

export function stockMessage(itemId: ItemId, remaining: number): string {
  if (remaining <= 0) return `${CATALOG[itemId].label} is sold out.`;
  const [one, many] = NOUN[itemId];
  return `Only ${remaining} ${remaining === 1 ? one : many} ${remaining === 1 ? 'is' : 'are'} left.`;
}

/** One RuleError per item the booking needs more of than remains. Empty means it fits. */
export function stockErrors(quote: Quote, inventory: Readonly<Record<string, number>>): RuleError[] {
  return ITEM_IDS.flatMap((id): RuleError[] => {
    const needed = quote.stockNeeded[id] ?? 0;
    const remaining = remainingOf(inventory, id);
    if (needed <= remaining) return [];
    return [{ code: remaining <= 0 ? 'SOLD_OUT' : 'INSUFFICIENT_STOCK', path: `stock.${id}`, message: stockMessage(id, remaining) }];
  });
}

/** Items with nothing left right now. Pricing hints use this so they never recommend a sold-out pass. */
export const soldOutItems = (inventory: Readonly<Record<string, number>>): ReadonlySet<ItemId> =>
  new Set(ITEM_IDS.filter((id) => remainingOf(inventory, id) <= 0));
