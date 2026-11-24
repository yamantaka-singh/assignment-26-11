import { formatFestivalDay } from '../../domain/catalog';
import { Card } from '../../ui/components/Card';
import { KrishnaMascot } from '../../ui/components/KrishnaMascot';
import { MoneyText } from '../../ui/components/MoneyText';
import { Button } from '../../ui/components/Button';
import { Notice } from '../../ui/components/Notice';
import { describeTicket, personLabel } from '../model';
import { PaymentPanel } from './PaymentPanel';
import { PromoForm } from './PromoForm';
import type { StepProps } from './props';

interface Props extends StepProps {
  readonly onPay: () => void;
}

export function ReviewStep({ state, dispatch, onPay }: Props) {
  const { draft, quote, quoteStatus } = state;
  return (
    <div className="stack">
      {state.notice ? (
        <Notice tone={state.notice.tone} title={state.notice.title}>
          {state.notice.text}
        </Notice>
      ) : null}
      {quoteStatus === 'offline' || quoteStatus === 'error' ? (
        <Notice tone="warning" title={quoteStatus === 'offline' ? 'You appear to be offline' : "We couldn't update your total"}>
          <p>Your details are safe. {quoteStatus === 'offline' ? 'Reconnect, then' : 'Please'} try again.</p>
          <Button variant="secondary" onClick={() => dispatch({ type: 'quoteRefreshRequested' })}>
            Retry
          </Button>
        </Notice>
      ) : null}

      <Card title="Who is coming" headingLevel={3} badge={<KrishnaMascot pose="blessing" size="sm" />}>
        <ul className="list-plain">
          {draft.people.map((p, i) => (
            <li key={p.id} className="line">
              <span>{personLabel(p, i)}</span>
              <span className="muted">{describeTicket(p, draft.passes)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Your booking" headingLevel={3} badge={<KrishnaMascot pose="butter_pot" size="sm" />}>
        {quote === null ? (
          <p aria-busy={quoteStatus === 'loading'} className="muted">
            {quoteStatus === 'loading' ? 'Working out your total…' : 'Your total will appear here.'}
          </p>
        ) : (
          <div aria-busy={quoteStatus === 'loading'}>
            <ul className="list-plain">
              {quote.lines.map((l) => (
                <li key={`${l.itemId}-${l.attendeeId ?? ''}-${l.day ?? ''}`} className="line">
                  <span>
                    {l.label}
                    {l.day ? ` (${formatFestivalDay(l.day)})` : ''}
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
              <MoneyText cents={quote.totalCents} />
            </div>
          </div>
        )}
        {(quote?.hints ?? []).map((h) => (
          <p key={h} className="muted">
            {h}
          </p>
        ))}
      </Card>

      <Card title="Have a promo code?" headingLevel={3}>
        <PromoForm applied={draft.promoCode} result={quote?.promo} dispatch={dispatch} />
      </Card>

      <Card title="Payment" headingLevel={3}>
        <form
          id="pay-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onPay();
          }}
        >
          <PaymentPanel state={state} dispatch={dispatch} onPay={onPay} />
        </form>
      </Card>
    </div>
  );
}
