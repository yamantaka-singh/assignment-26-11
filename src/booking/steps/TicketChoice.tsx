import type { Dispatch } from 'react';
import { FESTIVAL_DAYS, formatFestivalDay, type ItemId } from '../../domain/catalog';
import { CheckboxGroup } from '../../ui/components/CheckboxGroup';
import { Field } from '../../ui/components/Field';
import { formatCents } from '../../ui/components/MoneyText';
import type { BookingAction, BookingState } from '../machine';
import { bandOf, exactAt, hasRoom, type Person } from '../model';
import { itemOf, stockNote } from './props';
import type { RuleError } from '../../domain/types';

interface Props {
  readonly state: BookingState;
  readonly dispatch: Dispatch<BookingAction>;
  readonly person: Person;
  readonly index: number;
  readonly errors: readonly RuleError[];
}

interface Option {
  readonly kind: 'day' | 'allDay' | 'family';
  readonly label: string;
  readonly itemId: ItemId;
  readonly detail: string;
}

function optionsFor(person: Person): readonly Option[] {
  const adult = bandOf(person.age) === 'adult';
  return [
    { kind: 'day', label: 'Day Pass', itemId: adult ? 'day-adult' : 'day-child', detail: 'per day, you pick the days' },
    { kind: 'allDay', label: 'All-Day Pass', itemId: adult ? 'allday-adult' : 'allday-child', detail: 'all 5 days' },
    { kind: 'family', label: 'Family Pass', itemId: 'family', detail: 'one day, up to 2 adults + 2 children' },
  ];
}

export function TicketChoice({ state, dispatch, person, index, errors }: Props) {
  const { draft } = state;
  const name = `ticket-${person.id}`;
  const ticketError = exactAt(errors, `attendees.${index}.ticket`);
  const daysError = exactAt(errors, `attendees.${index}.ticket.days`);

  const choose = (kind: Option['kind']): void => {
    if (kind !== 'family') return dispatch({ type: 'ticketKindChosen', personId: person.id, kind });
    const open = draft.passes.find((p) => hasRoom(draft, person, p.id));
    dispatch(
      open
        ? { type: 'passJoined', personId: person.id, passId: open.id }
        : { type: 'passAdded', id: crypto.randomUUID(), day: FESTIVAL_DAYS[0], personId: person.id },
    );
  };

  return (
    <div className="stack">
      <fieldset aria-describedby={ticketError ? `${name}-error` : undefined}>
        <legend>Ticket for {person.name.trim() || `person ${index + 1}`}</legend>
        {optionsFor(person).map((o) => {
          const item = itemOf(state, o.itemId);
          const note = stockNote(item);
          const price = item ? ` — ${formatCents(item.priceCents)}` : '';
          const checked = person.ticket.kind === o.kind;
          return (
            <label key={o.kind} className="choice">
              <input type="radio" name={name} value={o.kind} checked={checked} disabled={item?.soldOut === true && !checked} onChange={() => choose(o.kind)} />
              <span>
                {o.label}
                {price}
                <span className="choice__reason">
                  {o.detail}
                  {note ? ` · ${note}` : ''}
                </span>
              </span>
            </label>
          );
        })}
        {ticketError ? (
          <p id={`${name}-error`} className="field__error" role="alert">
            {ticketError}
          </p>
        ) : null}
      </fieldset>

      {person.ticket.kind === 'day' ? (
        <CheckboxGroup
          legend="Which days?"
          options={FESTIVAL_DAYS.map((d) => ({ value: d, label: formatFestivalDay(d) }))}
          selected={person.ticket.days}
          error={daysError}
          onChange={(days) => dispatch({ type: 'dayPassDaysChosen', personId: person.id, days })}
        />
      ) : null}

      {person.ticket.kind === 'family' ? <PassPicker state={state} dispatch={dispatch} person={person} passId={person.ticket.passId} /> : null}
    </div>
  );
}

function PassPicker({ state, dispatch, person, passId }: Pick<Props, 'state' | 'dispatch' | 'person'> & { readonly passId: string }) {
  const { draft } = state;
  return (
    <Field label="Which Family Pass?">
      {(c) => (
        <select {...c} value={passId} onChange={(e) => dispatch({ type: 'passJoined', personId: person.id, passId: e.currentTarget.value })}>
          {draft.passes.map((p, n) => (
            <option key={p.id} value={p.id} disabled={p.id !== passId && !hasRoom(draft, person, p.id)}>
              Pass {n + 1} — {formatFestivalDay(p.day)}
              {p.id !== passId && !hasRoom(draft, person, p.id) ? ' (full)' : ''}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
