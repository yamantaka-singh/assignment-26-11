import { Card } from '../../ui/components/Card';
import { KrishnaMascot, type KrishnaPose } from '../../ui/components/KrishnaMascot';
import { Notice } from '../../ui/components/Notice';
import { bandOf, personLabel } from '../model';
import { PassPanel } from './PassPanel';
import type { StepProps } from './props';
import { TicketChoice } from './TicketChoice';

const TICKET_POSES: readonly KrishnaPose[] = [
  'dancing',
  'eating_butter',
  'blessing',
  'resting',
  'joyful',
  'butter_pot',
  'welcome',
];

export function TicketsStep(props: StepProps) {
  const { state } = props;
  const hints = state.quote?.hints ?? [];
  return (
    <div className="stack">
      {state.catalog.status === 'offline' || state.catalog.status === 'error' ? (
        <Notice tone="warning">We couldn&apos;t check what&apos;s left right now. You can carry on, and we&apos;ll confirm availability when you pay.</Notice>
      ) : null}
      {state.notice ? (
        <Notice tone={state.notice.tone} title={state.notice.title}>
          {state.notice.text}
        </Notice>
      ) : null}
      {state.draft.people.map((p, i) => {
        const band = bandOf(p.age);
        const mascotPose = band === 'toddler' ? 'crawling' : TICKET_POSES[i % TICKET_POSES.length];
        return (
          <Card key={p.id} title={personLabel(p, i)} headingLevel={3} badge={<KrishnaMascot pose={mascotPose} size="sm" />}>
            {band === 'toddler' ? (
              <p>Under 5 — free, no ticket needed. We just count them at the door.</p>
            ) : (
              <TicketChoice state={state} dispatch={props.dispatch} person={p} index={i} errors={props.errors} />
            )}
          </Card>
        );
      })}
      <PassPanel {...props} />
      {hints.length > 0 ? (
        <Notice tone="info" title="Good to know">
          <ul className="list-plain">
            {hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
    </div>
  );
}
