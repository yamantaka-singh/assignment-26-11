import { useId } from 'react';

export interface QuantityInputProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (next: number) => void;
  readonly hint?: string;
  readonly error?: string;
}

/** A number with − / + buttons. The text box stays editable so a keyboard user can just type. */
export function QuantityInput({ label, value, min, max, onChange, hint, error }: QuantityInputProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  const clamp = (n: number): number => Math.min(max, Math.max(min, Number.isFinite(n) ? Math.trunc(n) : min));

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {hint ? (
        <span id={hintId} className="field__hint">
          {hint}
        </span>
      ) : null}
      <div className="qty">
        <button type="button" className="btn btn--secondary qty__btn" aria-label={`Fewer: ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>
          −
        </button>
        <input
          id={id}
          className="qty__input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(clamp(Number(e.currentTarget.value.replace(/\D/g, ''))))}
        />
        <button type="button" className="btn btn--secondary qty__btn" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>
          +
        </button>
      </div>
      {error ? (
        <span id={errorId} className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
