import type { ReactNode } from 'react';
import type { Quote } from '../domain/types';
import { MoneyText } from '../ui/components/MoneyText';
import type { QuoteStatus } from './model';

interface Props {
  readonly quote: Quote | null;
  readonly status: QuoteStatus;
  readonly children: ReactNode;
}

const STATUS_TEXT: Readonly<Record<QuoteStatus, string>> = {
  idle: '',
  loading: 'Updating…',
  ready: '',
  error: "Couldn't update",
  offline: 'Offline',
};

/** The server's total, always. While it is being refreshed the last figure stays, marked busy. */
export function SummaryBar({ quote, status, children }: Props) {
  return (
    <div className="summary-bar">
      <div role="status" aria-busy={status === 'loading'}>
        <span className="summary-bar__label">Total{STATUS_TEXT[status] ? ` · ${STATUS_TEXT[status]}` : ''}</span>
        <span className="summary-bar__total" style={{ opacity: status === 'loading' ? 0.6 : 1 }}>
          {quote ? <MoneyText cents={quote.totalCents} /> : '—'}
        </span>
      </div>
      <div className="summary-bar__actions">{children}</div>
    </div>
  );
}
