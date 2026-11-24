import { useEffect, useRef } from 'react';
import { Button } from '../../ui/components/Button';
import { Field } from '../../ui/components/Field';
import { MoneyText } from '../../ui/components/MoneyText';
import { Notice } from '../../ui/components/Notice';
import type { StepProps } from './props';

interface Props extends Pick<StepProps, 'state' | 'dispatch'> {
  readonly onPay: () => void;
}

export const OFFLINE_PAY =
  "You appear to be offline. Nothing has been charged — we'll keep your details; try again when you're back online.";
const CARD_HINT = 'Use 4242 4242 4242 4242 (success) or 4000 0000 0000 0002 (decline) — this is a simulated payment.';

export function PaymentPanel({ state, dispatch, onPay }: Props) {
  const { quote, submit, cardNumber } = state;
  const cardRef = useRef<HTMLInputElement>(null);
  const cardProblem = submit.status === 'card';

  // A declined card keeps the person at the card field, ready to try another.
  useEffect(() => {
    if (cardProblem) cardRef.current?.focus();
  }, [cardProblem, submit]);

  if (quote === null) return null;
  const retry = (
    <Button variant="secondary" onClick={onPay}>
      Try again
    </Button>
  );

  return (
    <div className="stack">
      {submit.status === 'offline' ? (
        <Notice tone="warning" title="No connection">
          <p>{OFFLINE_PAY}</p>
          {retry}
        </Notice>
      ) : null}
      {submit.status === 'failed' ? (
        <Notice tone="error" title="That didn't go through">
          <p>{submit.message}</p>
          {retry}
        </Notice>
      ) : null}
      {submit.status === 'card' ? (
        <Notice tone="error" title="Payment not completed">
          {submit.message}
        </Notice>
      ) : null}
      {quote.totalCents === 0 ? (
        <Notice tone="success" title="Nothing to pay">
          Your total is <MoneyText cents={0} />, so no card is needed. Press Confirm booking to finish.
        </Notice>
      ) : (
        <Field label="Card number" required hint={CARD_HINT} error={cardProblem ? 'Please check the card number and try again.' : undefined}>
          {(c) => (
            <input
              {...c}
              ref={cardRef}
              type="text"
              inputMode="numeric"
              autoComplete="cc-number"
              value={cardNumber}
              onChange={(e) => dispatch({ type: 'cardEdited', value: e.currentTarget.value })}
            />
          )}
        </Field>
      )}
    </div>
  );
}
