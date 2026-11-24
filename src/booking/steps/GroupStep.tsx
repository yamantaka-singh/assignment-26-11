import { useEffect, useState } from 'react';
import { MAX_ATTENDEES } from '../../domain/catalog';
import { Button } from '../../ui/components/Button';
import { Card } from '../../ui/components/Card';
import { Field } from '../../ui/components/Field';
import { KrishnaMascot, type KrishnaPose } from '../../ui/components/KrishnaMascot';
import { Notice } from '../../ui/components/Notice';
import { ageProblem, bandOf, exactAt, messageAt, type Person } from '../model';
import type { StepProps } from './props';

const GROUP_PERSON_POSES: readonly KrishnaPose[] = [
  'blessing',
  'resting',
  'eating_butter',
  'butter_pot',
  'crawling',
  'dancing',
];

const BAND_TEXT = {
  toddler: 'Under 5 — free, no ticket needed',
  child: 'Child (5 to 11)',
  adult: 'Adult (12 and over)',
} as const;

// D9: AGE_REFERENCE_DAY (10 Nov 2026) is the date every age is measured on.
const AGE_NOTE = 'Age on 10 Nov 2026 (first festival day)';

export function GroupStep({ state, dispatch, errors }: StepProps) {
  const { draft } = state;
  const attempted = state.attempted.group;
  const full = draft.people.length >= MAX_ATTENDEES;

  const additionalPeople = draft.people.filter((p) => p.id !== 'booker');
  const [activePersonId, setActivePersonId] = useState<string | null>(null);

  // Active person defaults to selected id or the most recent guest
  const activePerson =
    additionalPeople.find((p) => p.id === activePersonId) ??
    additionalPeople[additionalPeople.length - 1] ??
    null;

  const activeIndex = activePerson ? additionalPeople.findIndex((p) => p.id === activePerson.id) : -1;
  const activeFullIndex = activePerson ? draft.people.findIndex((p) => p.id === activePerson.id) : -1;

  // On submit attempt with validation errors, automatically switch tab to the first guest with an error
  useEffect(() => {
    if (!attempted) return;
    const broken = additionalPeople.find((p) => {
      const idx = draft.people.findIndex((item) => item.id === p.id);
      return (
        p.name.trim() === '' ||
        ageProblem(p.ageInput) !== null ||
        messageAt(errors, `attendees.${idx}.name`) !== undefined ||
        messageAt(errors, `attendees.${idx}.age`) !== undefined
      );
    });
    if (broken && broken.id !== activePerson?.id) {
      setActivePersonId(broken.id);
    }
  }, [attempted, state.attemptNonce]);

  const nameError =
    messageAt(errors, 'booker.name') ??
    exactAt(errors, 'attendees.0.name') ??
    (attempted && draft.booker.name.trim() === '' ? 'Please enter your name.' : undefined);

  const emailInvalid =
    draft.booker.email.trim() === '' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.booker.email.trim());
  const emailError =
    messageAt(errors, 'booker.email') ??
    (attempted && emailInvalid ? 'Please enter a valid email address.' : undefined);

  const phoneInvalid =
    draft.booker.phone.trim() === '' ||
    !/^[0-9 +\-()]{7,20}$/.test(draft.booker.phone.trim()) ||
    (draft.booker.phone.match(/\d/g) ?? []).length < 7;
  const rawPhoneError = messageAt(errors, 'booker.phone');
  const phoneError =
    rawPhoneError !== undefined
      ? 'Enter a valid phone number.'
      : attempted && phoneInvalid
      ? 'Enter a valid phone number.'
      : undefined;

  const ageError = (input: string, path: string): string | undefined => {
    const problem = input.trim() !== '' || attempted ? ageProblem(input) : null;
    return problem ?? messageAt(errors, path);
  };

  const ageField = (p: Person, path: string, onChange: (v: string) => void, label: string) => {
    const band = bandOf(p.age);
    return (
      <Field label={label} required error={ageError(p.ageInput, path)} hint={`${band ? BAND_TEXT[band] : 'Whole number, e.g. 9'}. ${AGE_NOTE}`}>
        {(c) => <input {...c} type="text" inputMode="numeric" autoComplete="off" value={p.ageInput} onChange={(e) => onChange(e.currentTarget.value)} />}
      </Field>
    );
  };

  // Anti-spam constraint: cannot add another guest if the currently open guest has empty name or invalid age
  const currentPersonComplete =
    activePerson !== null &&
    activePerson.name.trim() !== '' &&
    activePerson.ageInput.trim() !== '' &&
    ageProblem(activePerson.ageInput) === null;

  const handleAddPerson = () => {
    if (full) return;
    if (additionalPeople.length > 0 && !currentPersonComplete) return;
    const newId = crypto.randomUUID();
    dispatch({ type: 'personAdded', id: newId });
    setActivePersonId(newId);
  };

  const handleRemovePerson = (id: string) => {
    const nextList = additionalPeople.filter((p) => p.id !== id);
    const nextActive = nextList[nextList.length - 1]?.id ?? null;
    setActivePersonId(nextActive);
    dispatch({ type: 'personRemoved', id });
  };

  return (
    <div className="group-layout">
      <Card title="About you" headingLevel={3} badge={<KrishnaMascot pose="welcome" size="sm" />}>
        <div className="stack">
          <Field label="Your name" required error={nameError}>
            {(c) => (
              <input {...c} type="text" autoComplete="name" value={draft.booker.name} onChange={(e) => dispatch({ type: 'bookerEdited', field: 'name', value: e.currentTarget.value })} />
            )}
          </Field>
          <div className="grid-2">
            <Field label="Email" required hint="For your confirmation" error={emailError}>
              {(c) => (
                <input {...c} type="email" autoComplete="email" value={draft.booker.email} onChange={(e) => dispatch({ type: 'bookerEdited', field: 'email', value: e.currentTarget.value })} />
              )}
            </Field>
            <Field label="Phone" required hint="For booking updates" error={phoneError}>
              {(c) => (
                <input {...c} type="tel" autoComplete="tel" value={draft.booker.phone} onChange={(e) => dispatch({ type: 'bookerEdited', field: 'phone', value: e.currentTarget.value })} />
              )}
            </Field>
          </div>
          <Field
            label="Your age"
            required
            hint={`You must be 18 or over to book. ${AGE_NOTE}`}
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

      <Card
        title="Who else is coming?"
        headingLevel={3}
        badge={
          <span className="guest-badge-pill" aria-label={`${additionalPeople.length} additional guests added`}>
            {additionalPeople.length === 0
              ? 'Solo booking'
              : additionalPeople.length === 1
              ? '1 guest added'
              : `${additionalPeople.length} guests added`}
          </span>
        }
      >
        <p className="muted">Add everyone else in your group. Children only need a first name and an age.</p>
        {exactAt(errors, 'attendees') ? <Notice tone="error">{exactAt(errors, 'attendees')}</Notice> : null}

        {additionalPeople.length > 0 && (
          <div className="guest-tabs-bar">
            <div className="guest-tabs" role="tablist" aria-label="Group members">
              {additionalPeople.map((p, idx) => {
                const isActive = p.id === activePerson?.id;
                const fullIdx = draft.people.findIndex((item) => item.id === p.id);
                const hasProblem =
                  attempted &&
                  (p.name.trim() === '' ||
                    ageProblem(p.ageInput) !== null ||
                    messageAt(errors, `attendees.${fullIdx}.name`) !== undefined ||
                    messageAt(errors, `attendees.${fullIdx}.age`) !== undefined);
                const displayName = p.name.trim() || `Guest ${idx + 1}`;

                return (
                  <button
                    key={p.id}
                    type="button"
                    role="tab"
                    id={`tab-guest-${p.id}`}
                    aria-selected={isActive}
                    aria-controls={`panel-guest-${p.id}`}
                    className={`guest-tab ${isActive ? 'guest-tab--active' : ''} ${hasProblem ? 'guest-tab--error' : ''}`}
                    onClick={() => setActivePersonId(p.id)}
                  >
                    <span className="guest-tab__num">{idx + 1}</span>
                    <span className="guest-tab__name">{displayName}</span>
                    {p.age ? <span className="guest-tab__age">{p.age}y</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activePerson ? (
          <div
            id={`panel-guest-${activePerson.id}`}
            role="tabpanel"
            aria-labelledby={`tab-guest-${activePerson.id}`}
            className="guest-card-panel"
          >
            <Card
              title={activePerson.name.trim() || `Person ${activeIndex + 1}`}
              headingLevel={3}
              badge={<KrishnaMascot pose={GROUP_PERSON_POSES[activeIndex % GROUP_PERSON_POSES.length]} size="xs" />}
            >
              <div className="stack">
                <Field
                  label="Name"
                  required
                  error={
                    messageAt(errors, `attendees.${activeFullIndex}.name`) ??
                    (attempted && activePerson.name.trim() === '' ? 'Please enter a name.' : undefined)
                  }
                >
                  {(c) => (
                    <input
                      {...c}
                      type="text"
                      autoComplete="off"
                      value={activePerson.name}
                      onChange={(e) => dispatch({ type: 'personEdited', id: activePerson.id, field: 'name', value: e.currentTarget.value })}
                    />
                  )}
                </Field>

                {ageField(
                  activePerson,
                  `attendees.${activeFullIndex}.age`,
                  (value) => dispatch({ type: 'personEdited', id: activePerson.id, field: 'age', value }),
                  'Age',
                )}

                <div className="guest-card-actions">
                  <Button
                    variant="ghost"
                    onClick={() => handleRemovePerson(activePerson.id)}
                    aria-label={`Remove ${activePerson.name.trim() || `person ${activeIndex + 1}`}`}
                  >
                    Remove
                  </Button>

                  <Button
                    className="btn--add-person"
                    variant="secondary"
                    disabled={full || !currentPersonComplete}
                    onClick={handleAddPerson}
                    title={
                      !currentPersonComplete
                        ? 'Enter name and age above to add another person'
                        : full
                        ? `Maximum group size (${MAX_ATTENDEES}) reached`
                        : undefined
                    }
                  >
                    + Add another person
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <div className="guest-empty-box">
            <p className="guest-empty-text">No additional guests added yet.</p>
            <Button
              className="btn--add-person"
              variant="secondary"
              disabled={full}
              onClick={handleAddPerson}
            >
              + Add a person
            </Button>
          </div>
        )}

        {full ? <p className="muted">That&apos;s the most we can take in one booking ({MAX_ATTENDEES} people).</p> : null}
      </Card>
    </div>
  );
}
