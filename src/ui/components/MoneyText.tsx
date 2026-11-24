const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Integer cents -> "$146.70". Display only; never feed the result back into maths. */
export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

export interface MoneyTextProps {
  readonly cents: number;
}

export function MoneyText({ cents }: MoneyTextProps) {
  return <span>{formatCents(cents)}</span>;
}
