// validate -> load promo -> evaluate -> price -> check stock. The one pipeline /quote and /bookings share.
import { evaluatePromo, normalizePromoCode } from '../domain/promo';
import { priceBooking } from '../domain/pricing';
import { validateBooking } from '../domain/eligibility';
import type { Quote, RuleError, ValidBooking } from '../domain/types';
import type { Repo } from './repo';
import { soldOutItems, stockErrors } from './stock';

export type QuoteOutcome =
  | { readonly kind: 'ok'; readonly booking: ValidBooking; readonly quote: Quote }
  | { readonly kind: 'invalid'; readonly errors: readonly RuleError[] }
  | { readonly kind: 'out-of-stock'; readonly errors: readonly RuleError[]; readonly quote: Quote };

export async function buildQuote(
  repo: Pick<Repo, 'getInventory' | 'getPromo'>,
  input: unknown,
  now: Date,
): Promise<QuoteOutcome> {
  const validated = validateBooking(input);
  if (!validated.ok) return { kind: 'invalid', errors: validated.error };
  const booking = validated.value;

  const code = normalizePromoCode(booking.promoCode);
  const record = code === undefined ? undefined : await repo.getPromo(code);
  const inventory = await repo.getInventory();
  const quote = priceBooking(booking, evaluatePromo(code, now, record), soldOutItems(inventory));

  const errors = stockErrors(quote, inventory);
  return errors.length > 0 ? { kind: 'out-of-stock', errors, quote } : { kind: 'ok', booking, quote };
}
