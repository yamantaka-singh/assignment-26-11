// The festival's fixed data. Rules key off these ids and kinds, never off labels:
// renaming a ticket must not change behaviour.

export const FESTIVAL = {
  name: 'Sharad Utsav 2026',
  location: 'Radha Krishna Temple, Allen, Texas',
  currency: 'USD',
} as const;

export const FESTIVAL_DAYS = [
  '2026-11-10',
  '2026-11-11',
  '2026-11-12',
  '2026-11-13',
  '2026-11-14',
] as const;
export type FestivalDay = (typeof FESTIVAL_DAYS)[number];

// A lookup table, not Intl: identical output on every runtime (Worker, Node, browser).
const DAY_LABELS: Readonly<Record<FestivalDay, string>> = {
  '2026-11-10': 'Tue 10 Nov',
  '2026-11-11': 'Wed 11 Nov',
  '2026-11-12': 'Thu 12 Nov',
  '2026-11-13': 'Fri 13 Nov',
  '2026-11-14': 'Sat 14 Nov',
};

/** The one way a festival day is shown to people: "Wed 11 Nov". */
export const formatFestivalDay = (day: FestivalDay): string => DAY_LABELS[day];

export const GARBA_DAYS = ['2026-11-11', '2026-11-13'] as const satisfies readonly FestivalDay[];
export type GarbaDay = (typeof GARBA_DAYS)[number];

/** Ages are measured on the first festival day (decision D9). */
export const AGE_REFERENCE_DAY: FestivalDay = '2026-11-10';
export const MIN_AGE = 0;
export const MAX_AGE = 120;
export const CHILD_MIN_AGE = 5;
export const ADULT_MIN_AGE = 12;
export const BOOKER_MIN_AGE = 18;

export const MAX_ATTENDEES = 20;
export const MAX_DANDIYA = 20;
export const FAMILY_PASS_MAX_ADULTS = 2;
export const FAMILY_PASS_MAX_CHILDREN = 2;

export const ITEM_IDS = [
  'day-adult',
  'day-child',
  'allday-adult',
  'allday-child',
  'family',
  'dandiya',
  'dinner',
  'garba',
] as const;
export type ItemId = (typeof ITEM_IDS)[number];

/** Price unit says what one unit of stock and price means. */
export type PriceUnit = 'person-day' | 'person' | 'pass-day' | 'each' | 'person-session';

export interface CatalogItem {
  readonly id: ItemId;
  readonly label: string;
  readonly priceCents: number;
  readonly unit: PriceUnit;
  readonly initialStock: number;
}

export const CATALOG: Readonly<Record<ItemId, CatalogItem>> = {
  'day-adult': { id: 'day-adult', label: 'Day Pass – Adult (12+)', priceCents: 1500, unit: 'person-day', initialStock: 380 },
  'day-child': { id: 'day-child', label: 'Day Pass – Child (5–11)', priceCents: 800, unit: 'person-day', initialStock: 260 },
  'allday-adult': { id: 'allday-adult', label: 'All-Day Pass – Adult (12+)', priceCents: 6000, unit: 'person', initialStock: 0 },
  'allday-child': { id: 'allday-child', label: 'All-Day Pass – Child (5–11)', priceCents: 3000, unit: 'person', initialStock: 140 },
  family: { id: 'family', label: 'Family Pass (up to 2 adults + 2 children, one day)', priceCents: 4000, unit: 'pass-day', initialStock: 95 },
  dandiya: { id: 'dandiya', label: 'Dandiya Sticks (pair)', priceCents: 500, unit: 'each', initialStock: 900 },
  dinner: { id: 'dinner', label: 'Dinner Plate', priceCents: 1200, unit: 'person-day', initialStock: 1700 },
  garba: { id: 'garba', label: 'Garba Workshop', priceCents: 2000, unit: 'person-session', initialStock: 2 },
};

export const PROMO_CODES = ['SEVA10', 'FLAT20', 'KIDSFREE', 'EXPIRED5', 'MAXEDOUT'] as const;
export type PromoCode = (typeof PROMO_CODES)[number];
