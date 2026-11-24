import { useState, type Dispatch } from 'react';
import type { PromoResult } from '../../domain/types';
import { Button } from '../../ui/components/Button';
import { Field } from '../../ui/components/Field';
import { Notice } from '../../ui/components/Notice';
import type { BookingAction } from '../machine';

interface Props {
  readonly applied: string;
  readonly result: PromoResult | undefined;
  readonly dispatch: Dispatch<BookingAction>;
}

/** Applying is explicit (button or Enter), so half-typed codes never produce "unknown code" messages. */
export function PromoForm({ applied, result, dispatch }: Props) {
  const [text, setText] = useState(applied);
  const submit = (code: string): void => dispatch({ type: 'promoApplied', code });
  const showResult = applied !== '' && result !== undefined && result.status !== 'none';
  return (
    <div className="stack">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <Field label="Promo code" hint="Optional. One code per booking.">
          {(c) => <input {...c} type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={text} onChange={(e) => setText(e.currentTarget.value)} />}
        </Field>
        <div className="summary-bar__actions" style={{ marginInlineStart: 0 }}>
          <Button type="submit" variant="secondary">
            Apply code
          </Button>
          {applied !== '' ? (
            <Button
              variant="ghost"
              onClick={() => {
                setText('');
                submit('');
              }}
            >
              Remove code
            </Button>
          ) : null}
        </div>
      </form>
      {showResult ? <Notice tone={result.status === 'applied' ? 'success' : 'warning'}>{result.message}</Notice> : null}
    </div>
  );
}
