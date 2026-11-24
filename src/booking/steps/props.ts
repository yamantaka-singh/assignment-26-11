import type { Dispatch } from 'react';
import type { CatalogItemView } from '../../api/schemas';
import type { ItemId } from '../../domain/catalog';
import type { BookingAction, BookingState } from '../machine';
import type { RuleError } from '../../domain/types';

export interface StepProps {
  readonly state: BookingState;
  readonly dispatch: Dispatch<BookingAction>;
  /** Server errors this step is allowed to show (empty until the person has tried to continue). */
  readonly errors: readonly RuleError[];
}

export const itemOf = (state: BookingState, id: ItemId): CatalogItemView | undefined =>
  state.catalog.status === 'ready' ? state.catalog.catalog.items.find((i) => i.id === id) : undefined;

const LOW_STOCK = 10;

/** "Sold out", "Only 2 left", or nothing. Text, not colour, carries the meaning. */
export function stockNote(item: CatalogItemView | undefined): string | undefined {
  if (item === undefined) return undefined;
  if (item.soldOut) return 'Sold out';
  return item.remaining <= LOW_STOCK ? `Only ${item.remaining} ${item.remaining === 1 ? 'place' : 'places'} left` : undefined;
}
