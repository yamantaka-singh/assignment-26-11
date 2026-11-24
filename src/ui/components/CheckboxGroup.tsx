import { useId } from 'react';

export interface CheckboxOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
  /** Why it is disabled, shown as text (e.g. "Sold out"). */
  readonly reason?: string;
}

export interface CheckboxGroupProps<T extends string> {
  readonly legend: string;
  readonly options: readonly CheckboxOption<T>[];
  readonly selected: readonly T[];
  readonly onChange: (next: readonly T[]) => void;
  readonly hint?: string;
  readonly error?: string;
}

export function CheckboxGroup<T extends string>({
  legend,
  options,
  selected,
  onChange,
  hint,
  error,
}: CheckboxGroupProps<T>) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  const toggle = (value: T, checked: boolean) =>
    onChange(checked ? [...selected, value] : selected.filter((v) => v !== value));

  return (
    <fieldset aria-describedby={describedBy}>
      <legend>{legend}</legend>
      {hint ? (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      ) : null}
      {options.map((opt) => {
        const reasonId = `${id}-${opt.value}-reason`;
        const reason = opt.disabled && opt.reason ? opt.reason : undefined;
        return (
          <label key={opt.value} className="choice">
            <input
              type="checkbox"
              value={opt.value}
              checked={selected.includes(opt.value)}
              disabled={opt.disabled}
              aria-describedby={reason ? reasonId : undefined}
              onChange={(e) => toggle(opt.value, e.currentTarget.checked)}
            />
            <span>
              {opt.label}
              {reason ? (
                <span id={reasonId} className="choice__reason">
                  {reason}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
      {error ? (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
