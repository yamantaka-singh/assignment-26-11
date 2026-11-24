import { Button } from '../../ui/components/Button';
import { Card } from '../../ui/components/Card';
import { KrishnaMascot } from '../../ui/components/KrishnaMascot';
import { MoneyText } from '../../ui/components/MoneyText';
import { Notice } from '../../ui/components/Notice';
import type { ConfirmationView } from '../machine';

interface Props {
  readonly confirmation: ConfirmationView;
  readonly onStartOver: () => void;
}

export function Confirmation({ confirmation, onStartOver }: Props) {
  const { reference, amountCents, people, bookerName, email, quote } = confirmation;
  return (
    <div className="stack">
      <Notice tone="success" title={amountCents === 0 ? "Booking confirmed" : "Payment received"}>
        {amountCents === 0 ? 'No payment was needed.' : <>We received <MoneyText cents={amountCents} />.</>} Keep your reference: the volunteers will look you up by it at the door.
      </Notice>
      <Card title="Your reference" headingLevel={3} tone="cream" badge={<KrishnaMascot pose="joyful" size="md" floating />}>
        <p className="reference" aria-label={`Booking reference ${reference}`}>
          {reference}
        </p>
        {bookerName || email ? <p className="muted">Booked by {[bookerName, email].filter(Boolean).join(' · ')}</p> : null}
      </Card>
      <Card title="Who is coming" headingLevel={3}>
        <ul className="list-plain">
          {people.map((p, i) => (
            <li key={`${p.name}-${i}`} className="line">
              <span>{p.name}</span>
              <span className="muted">{p.ticket}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="What you paid" headingLevel={3}>
        <ul className="list-plain">
          {quote.lines.map((l) => (
            <li key={`${l.itemId}-${l.attendeeId ?? ''}-${l.day ?? ''}`} className="line">
              <span>
                {l.label}
                {l.qty > 1 ? ` × ${l.qty}` : ''}
              </span>
              <MoneyText cents={l.totalCents} />
            </li>
          ))}
        </ul>
        {quote.discountCents > 0 ? (
          <div className="line line--discount">
            <span>Discount</span>
            <span>
              −<MoneyText cents={quote.discountCents} />
            </span>
          </div>
        ) : null}
        <div className="line total-line">
          <span>Total</span>
          <MoneyText cents={amountCents} />
        </div>
      </Card>
      <div className="no-print summary-bar__actions" style={{ marginInlineStart: 0 }}>
        <Button variant="secondary" onClick={() => window.print()}>
          Print this page
        </Button>
        <Button variant="ghost" onClick={onStartOver}>
          Make another booking
        </Button>
      </div>
    </div>
  );
}
