import { FAMILY_PASS_MAX_ADULTS, FAMILY_PASS_MAX_CHILDREN, FESTIVAL_DAYS, formatFestivalDay, type FestivalDay } from '../../domain/catalog';
import { Button } from '../../ui/components/Button';
import { Card } from '../../ui/components/Card';
import { Field } from '../../ui/components/Field';
import { KrishnaMascot, type KrishnaPose } from '../../ui/components/KrishnaMascot';
import { countByBand, messageAt, personLabel } from '../model';
import type { StepProps } from './props';

const FAMILY_PASS_POSES: readonly KrishnaPose[] = ['joyful', 'welcome', 'blessing', 'resting'];

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function PassPanel({ state, dispatch, errors }: StepProps) {
  const { draft } = state;
  if (draft.passes.length === 0) return null;
  return (
    <>
      {draft.passes.map((pass, n) => {
        const members = draft.people.flatMap((p, i) => (p.ticket.kind === 'family' && p.ticket.passId === pass.id ? [personLabel(p, i)] : []));
        const adults = countByBand(draft, pass.id, 'adult');
        const children = countByBand(draft, pass.id, 'child');
        return (
          <Card
            key={pass.id}
            title={`Family Pass ${n + 1}`}
            headingLevel={3}
            badge={<KrishnaMascot pose={FAMILY_PASS_POSES[n % FAMILY_PASS_POSES.length]} size="sm" />}
          >
            <div className="stack">
              <Field label="Day for this pass" error={messageAt(errors, `familyPasses.${n}`)}>
                {(c) => (
                  <select
                    {...c}
                    value={pass.day}
                    onChange={(e) => {
                      const day = FESTIVAL_DAYS.find((d): d is FestivalDay => d === e.currentTarget.value);
                      if (day) dispatch({ type: 'passDayChosen', passId: pass.id, day });
                    }}
                  >
                    {FESTIVAL_DAYS.map((d) => (
                      <option key={d} value={d}>
                        {formatFestivalDay(d)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <p className="muted">
                On this pass: {members.join(', ')}. {plural(adults, 'adult', 'adults')} of {FAMILY_PASS_MAX_ADULTS}, {plural(children, 'child', 'children')} of{' '}
                {FAMILY_PASS_MAX_CHILDREN}. Under-5s come free.
              </p>
              <Button variant="ghost" onClick={() => dispatch({ type: 'passRemoved', passId: pass.id })}>
                Remove Family Pass {n + 1}
              </Button>
            </div>
          </Card>
        );
      })}
    </>
  );
}
