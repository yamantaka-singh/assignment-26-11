// Simulated card processor. Pure: the card number is read once and never stored, logged or returned.
export const APPROVED_CARD = '4242424242424242';
export const DECLINED_CARD = '4000000000000002';

export type PaymentOutcome =
  | { readonly status: 'approved' }
  | { readonly status: 'declined'; readonly message: string }
  | { readonly status: 'invalid'; readonly message: string };

export const DECLINED_MESSAGE = 'Your card was declined. No money was taken and nothing was booked.';
export const INVALID_MESSAGE = 'That card number is not accepted. For this demo, use the test card 4242 4242 4242 4242.';
export const MISSING_MESSAGE = 'Please enter your card details to pay for this booking.';

export function simulatePayment(cardNumber: string): PaymentOutcome {
  const digits = cardNumber.replace(/[\s-]/g, '');
  if (digits === APPROVED_CARD) return { status: 'approved' };
  if (digits === DECLINED_CARD) return { status: 'declined', message: DECLINED_MESSAGE };
  return { status: 'invalid', message: INVALID_MESSAGE };
}
