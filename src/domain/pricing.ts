// Pure pricing in integer cents. No I/O, no clock: promo status is decided by evaluatePromo().
import {
  ADULT_MIN_AGE,
  CATALOG,
  CHILD_MIN_AGE,
  FAMILY_PASS_MAX_ADULTS,
  FAMILY_PASS_MAX_CHILDREN,
  FESTIVAL_DAYS,
  formatFestivalDay,
  type ItemId,
} from './catalog';
import type { Attendee, PromoResult, Quote, QuoteLine, ValidBooking } from './types';

const dollars = (cents: number): string => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);

/** Half-up rounding of subtotal * percent / 100, entirely in integers. */
export function percentDiscountCents(subtotalCents: number, percent: number): number {
  return Math.floor((subtotalCents * percent + 50) / 100);
}

// Private band helper: price bands only (toddlers have no priced entry item).
const isAdult = (a: Attendee): boolean => a.age >= ADULT_MIN_AGE;
const isChild = (a: Attendee): boolean => a.age >= CHILD_MIN_AGE && a.age < ADULT_MIN_AGE;
const dayItem = (a: Attendee): ItemId | undefined => (isAdult(a) ? 'day-adult' : isChild(a) ? 'day-child' : undefined);
const allDayItem = (a: Attendee): ItemId | undefined =>
  isAdult(a) ? 'allday-adult' : isChild(a) ? 'allday-child' : undefined;

function line(itemId: ItemId, qty: number, extra: { attendee?: Attendee; day?: QuoteLine['day'] } = {}): QuoteLine {
  const item = CATALOG[itemId];
  const who = extra.attendee ? ` – ${extra.attendee.name}` : '';
  return {
    itemId,
    label: `${item.label}${who}`,
    attendeeId: extra.attendee?.id,
    day: extra.day,
    qty,
    unitCents: item.priceCents,
    totalCents: item.priceCents * qty,
  };
}

function attendeeLines(a: Attendee): QuoteLine[] {
  const lines: QuoteLine[] = [];
  const entry = a.ticket.kind === 'day' ? dayItem(a) : a.ticket.kind === 'allDay' ? allDayItem(a) : undefined;
  if (entry !== undefined) {
    // One day-pass line per person, qty = number of days (stock unit = person-day, D12).
    lines.push(line(entry, a.ticket.kind === 'day' ? a.ticket.days.length : 1, { attendee: a }));
  }
  if (a.dinnerDays.length > 0) lines.push(line('dinner', a.dinnerDays.length, { attendee: a }));
  if (a.garbaDays.length > 0) lines.push(line('garba', a.garbaDays.length, { attendee: a }));
  return lines;
}

/** A person on Day Passes for 4-5 days may be better off (or only able) to buy an All-Day Pass. */
function allDayHints(attendees: readonly Attendee[], soldOut: ReadonlySet<ItemId>): string[] {
  return attendees.flatMap((a) => {
    const dayId = dayItem(a);
    const allId = allDayItem(a);
    if (a.ticket.kind !== 'day' || dayId === undefined || allId === undefined) return [];
    const dayTotal = CATALOG[dayId].priceCents * a.ticket.days.length;
    const all = CATALOG[allId];
    if (dayTotal <= all.priceCents) return [];
    const n = a.ticket.days.length;
    const name = `All-Day ${isAdult(a) ? 'Adult' : 'Child'} Pass`;
    return soldOut.has(allId)
      ? [`${a.name}: the ${name} is sold out, so ${n} Day Passes (${dollars(dayTotal)}) are the way to go.`]
      : [`${a.name}: an ${name} (${dollars(all.priceCents)}) is cheaper than ${n} Day Passes (${dollars(dayTotal)}).`];
  });
}

function familyPassHints(booking: ValidBooking): string[] {
  const pass = CATALOG.family.priceCents;
  return booking.familyPasses.flatMap((p) => {
    const members = booking.attendees.filter((a) => a.ticket.kind === 'family' && a.ticket.passId === p.id);
    const individual = members.reduce((sum, a) => {
      const id = dayItem(a);
      return sum + (id === undefined ? 0 : CATALOG[id].priceCents);
    }, 0);
    return individual < pass
      ? [`Individual Day Passes would cost ${dollars(individual)} for these ${members.length} people on ${formatFestivalDay(p.day)}, less than the ${dollars(pass)} Family Pass.`]
      : [];
  });
}

function groupFamilyHints(attendees: readonly Attendee[]): string[] {
  return FESTIVAL_DAYS.flatMap((d) => {
    const singles = attendees.filter((a) => a.ticket.kind === 'day' && a.ticket.days.length === 1 && a.ticket.days[0] === d);
    const adults = singles.filter(isAdult).length;
    const children = singles.filter(isChild).length;
    return adults >= FAMILY_PASS_MAX_ADULTS && children >= FAMILY_PASS_MAX_CHILDREN
      ? [`On ${formatFestivalDay(d)}, a Family Pass (${dollars(CATALOG.family.priceCents)}) covers 2 adults and 2 children and costs less than individual Day Passes.`]
      : [];
  });
}

function applyPromo(promo: PromoResult, subtotal: number, lines: readonly QuoteLine[]): { promo: PromoResult; discount: number } {
  if (promo.status !== 'applied') return { promo, discount: 0 };
  if (promo.kind === 'percent') return { promo, discount: percentDiscountCents(subtotal, promo.value) };
  if (promo.kind === 'flat') return { promo, discount: Math.min(promo.value, subtotal) };
  const kids = lines
    .filter((l) => l.itemId === 'day-child' || l.itemId === 'allday-child')
    .reduce((sum, l) => sum + l.totalCents, 0);
  if (kids === 0) {
    return {
      promo: {
        status: 'not-applicable',
        code: promo.code,
        message: `${promo.code} is for children's tickets, and there aren't any in this booking. Your booking will go ahead without a discount.`,
      },
      discount: 0,
    };
  }
  return { promo, discount: kids };
}

/** `soldOut` is the live set of items with no stock left; hints must never recommend one of them. */
export function priceBooking(booking: ValidBooking, promo: PromoResult, soldOut: ReadonlySet<ItemId>): Quote {
  const lines: QuoteLine[] = [
    ...booking.attendees.flatMap(attendeeLines),
    ...booking.familyPasses.map((p) => line('family', 1, { day: p.day })),
    ...(booking.dandiyaQty > 0 ? [line('dandiya', booking.dandiyaQty)] : []),
  ];
  const subtotalCents = lines.reduce((sum, l) => sum + l.totalCents, 0);
  const applied = applyPromo(promo, subtotalCents, lines);
  const discountCents = Math.min(applied.discount, subtotalCents);

  // Every line's qty is already its stock unit (person-days, persons, passes, plates, sessions, sticks).
  const stockNeeded: Partial<Record<ItemId, number>> = {};
  for (const l of lines) stockNeeded[l.itemId] = (stockNeeded[l.itemId] ?? 0) + l.qty;

  return {
    lines,
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
    promo: applied.promo,
    hints: [...allDayHints(booking.attendees, soldOut), ...familyPassHints(booking), ...groupFamilyHints(booking.attendees)],
    stockNeeded,
  };
}
