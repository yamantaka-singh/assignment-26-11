import { MAX_ATTENDEES } from '../../domain/catalog';
import { Button } from '../../ui/components/Button';
import { Card } from '../../ui/components/Card';
import { Field } from '../../ui/components/Field';
import { Notice } from '../../ui/components/Notice';
import { ageProblem, bandOf, exactAt, messageAt, type Person } from '../model';
import type { StepProps } from './props';

const BAND_TEXT = {
  toddler: 'Under 5 — free, no ticket needed',
  child: 'Child (5 to 11)',
  adult: 'Adult (12 and over)',
} as const;

export function GroupStep({ state, dispatch, errors }: StepProps) {
  const { draft } = state;
  const attempted = state.attempted.group;
  const full = draft.people.length >= MAX_ATTENDEES;

  const ageError = (input: string, path: string): string | undefined => {
    const problem = input.trim() !== '' || attempted ? ageProblem(input) : null;
    return problem ?? messageAt(errors, path);
  };

  const ageField = (p: Person, path: string, onChange: (v: string) => void, label: string) => {
    const band = bandOf(p.age);
    return (
      <Field label={label} required error={ageError(p.ageInput, path)} hint={band ? BAND_TEXT[band] : 'Whole number, e.g. 9'}>
        {(c) => <input {...c} type="text" inputMode="numeric" autoComplete="off" value={p.ageInput} onChange={(e) => onChange(e.currentTarget.value)} />}
      </Field>
    );
  };

  return (
    <div className="stack">
      <Card title="About you" headingLevel={3}>
        <div className="stack">
          <Field label="Your name" required error={messageAt(errors, 'booker.name') ?? exactAt(errors, 'attendees.0.name')}>
            {(c) => (
              <input {...c} type="text" autoComplete="name" value={draft.booker.name} onChange={(e) => dispatch({ type: 'bookerEdited', field: 'name', value: e.currentTarget.value })} />
            )}
          </Field>
          <div className="grid-2">
            <Field label="Email" required hint="For your confirmation" error={messageAt(errors, 'booker.email')}>
              {(c) => (
                <input {...c} type="email" autoComplete="email" value={draft.booker.email} onChange={(e) => dispatch({ type: 'bookerEdited', field: 'email', value: e.currentTarget.value })} />
              )}
            </Field>
            <Field label="Phone" required error={messageAt(errors, 'booker.phone')}>
              {(c) => (
                <input {...c} type="tel" autoComplete="tel" value={draft.booker.phone} onChange={(e) => dispatch({ type: 'bookerEdited', field: 'phone', value: e.currentTarget.value })} />
              )}
            </Field>
          </div>
          <Field
            label="Your age"
            required
            hint="You must be 18 or over to book."
            error={ageError(draft.booker.ageInput, 'booker.age') ?? exactAt(errors, 'attendees.0.age')}
          >
            {(c) => (
              <input {...c} type="text" inputMode="numeric" autoComplete="off" value={draft.booker.ageInput} onChange={(e) => dispatch({ type: 'bookerEdited', field: 'age', value: e.currentTarget.value })} />
            )}
          </Field>
          <label className="choice">
            <input type="checkbox" checked={draft.booker.attending} onChange={(e) => dispatch({ type: 'attendingToggled', attending: e.currentTarget.checked })} />
            <span>I&apos;m attending the festival myself</span>
          </label>
        </div>
      </Card>

      <Card title="Who else is coming?" headingLevel={3}>
        <p className="muted">Add everyone else in your group. Children only need a first name and an age.</p>
        {exactAt(errors, 'attendees') ? <Notice tone="error">{exactAt(errors, 'attendees')}</Notice> : null}
        <ul className="list-plain">
          {draft.people.map((p, i) =>
            p.id === 'booker' ? null : (
              <li key={p.id}>
                <Card title={p.name.trim() || `Person ${i + 1}`} headingLevel={3}>
                  <div className="stack">
                    <Field label="Name" required error={messageAt(errors, `attendees.${i}.name`)}>
                      {(c) => (
                        <input {...c} type="text" autoComplete="off" value={p.name} onChange={(e) => dispatch({ type: 'personEdited', id: p.id, field: 'name', value: e.currentTarget.value })} />
                      )}
                    </Field>
                    {ageField(p, `attendees.${i}.age`, (value) => dispatch({ type: 'personEdited', id: p.id, field: 'age', value }), 'Age')}
                    <Button variant="ghost" onClick={() => dispatch({ type: 'personRemoved', id: p.id })} aria-label={`Remove ${p.name.trim() || `person ${i + 1}`}`}>
                      Remove
                    </Button>
                  </div>
                </Card>
              </li>
            ),
          )}
        </ul>
        <Button variant="secondary" disabled={full} onClick={() => dispatch({ type: 'personAdded', id: crypto.randomUUID() })}>
          Add a person
        </Button>
        {full ? <p className="muted">That&apos;s the most we can take in one booking ({MAX_ATTENDEES} people).</p> : null}
      </Card>
    </div>
  );
}
