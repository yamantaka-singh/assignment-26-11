import { formatFestivalDay, GARBA_DAYS, MAX_DANDIYA } from '../../domain/catalog';
import { Card } from '../../ui/components/Card';
import { CheckboxGroup } from '../../ui/components/CheckboxGroup';
import { KrishnaMascot, type KrishnaPose } from '../../ui/components/KrishnaMascot';
import { formatCents } from '../../ui/components/MoneyText';
import { Notice } from '../../ui/components/Notice';
import { QuantityInput } from '../../ui/components/QuantityInput';
import { bandOf, entryDaysOf, messageAt, personLabel } from '../model';
import { itemOf, type StepProps } from './props';

const EXTRAS_PERSON_POSES: readonly KrishnaPose[] = [
  'eating_butter',
  'butter_pot',
  'resting',
  'blessing',
  'welcome',
  'crawling',
  'joyful',
];

function garbaNote(left: number | undefined): string {
  if (left === undefined || left > 10) return '';
  if (left <= 0) return 'Sold out.';
  return `Only ${left} ${left === 1 ? 'place' : 'places'} left in total.`;
}

export function ExtrasStep({ state, dispatch, errors }: StepProps) {
  const { draft } = state;
  const dinner = itemOf(state, 'dinner');
  const garba = itemOf(state, 'garba');
  const dandiya = itemOf(state, 'dandiya');
  const garbaTaken = draft.people.reduce((n, p) => n + p.garbaDays.length, 0);
  const garbaLeft = garba?.remaining;
  const garbaFull = garbaLeft !== undefined && garbaTaken >= garbaLeft;

  const garbaReason = (selected: boolean): string | undefined => {
    if (selected || garbaLeft === undefined) return undefined;
    if (garbaLeft <= 0) return 'Sold out';
    return garbaFull ? `All ${garbaLeft} places are taken in this booking` : undefined;
  };

  return (
    <div className="stack">
      {state.notice ? (
        <Notice tone={state.notice.tone} title={state.notice.title}>
          {state.notice.text}
        </Notice>
      ) : null}
      {draft.people.map((p, i) => {
        const entry = entryDaysOf(draft, p.id);
        const band = bandOf(p.age);
        const canGarba = band === 'child' || band === 'adult';
        const garbaDays = GARBA_DAYS.filter((d) => entry.includes(d));
        return (
          <Card
            key={p.id}
            title={personLabel(p, i)}
            headingLevel={3}
            badge={<KrishnaMascot pose={EXTRAS_PERSON_POSES[i % EXTRAS_PERSON_POSES.length]} size="sm" />}
          >
            {entry.length === 0 ? (
              <p className="muted">Choose a ticket for this person first, then you can add dinner and workshops for the days they&apos;re coming.</p>
            ) : (
              <div className="stack">
                <CheckboxGroup
                  legend={`Dinner plates for ${personLabel(p, i)}`}
                  hint={`${dinner ? `${formatCents(dinner.priceCents)} per plate. ` : ''}Only on the days they have entry.`}
                  options={entry.map((d) => ({ value: d, label: formatFestivalDay(d) }))}
                  selected={p.dinnerDays}
                  error={messageAt(errors, `attendees.${i}.dinnerDays`)}
                  onChange={(days) => dispatch({ type: 'dinnerDaysChosen', personId: p.id, days })}
                />
                {canGarba && garbaDays.length > 0 ? (
                  <CheckboxGroup
                    legend={`Garba workshop for ${personLabel(p, i)}`}
                    hint={garba ? `${formatCents(garba.priceCents)} each. Ages 5 and over. ${garbaNote(garbaLeft)}` : undefined}
                    options={garbaDays.map((d) => {
                      const reason = garbaReason(p.garbaDays.includes(d));
                      return { value: d, label: formatFestivalDay(d), disabled: reason !== undefined, reason };
                    })}
                    selected={p.garbaDays}
                    error={messageAt(errors, `attendees.${i}.garbaDays`)}
                    onChange={(days) => dispatch({ type: 'garbaDaysChosen', personId: p.id, days })}
                  />
                ) : null}
                {band === 'toddler' ? <p className="muted">The Garba workshop is for ages 5 and over.</p> : null}
              </div>
            )}
          </Card>
        );
      })}
      <Card title="Dandiya sticks" headingLevel={3} badge={<KrishnaMascot pose="dancing" size="sm" />}>
        <QuantityInput
          label="Pairs of Dandiya sticks"
          hint={`${dandiya ? `${formatCents(dandiya.priceCents)} a pair. ` : ''}A souvenir for the whole booking, up to ${MAX_DANDIYA}.`}
          value={draft.dandiyaQty}
          min={0}
          max={MAX_DANDIYA}
          error={messageAt(errors, 'dandiyaQty')}
          onChange={(qty) => dispatch({ type: 'dandiyaChosen', qty })}
        />
      </Card>
    </div>
  );
}
