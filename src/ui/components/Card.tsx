import { useId, type ReactNode } from 'react';

export interface CardProps {
  readonly title: ReactNode;
  readonly headingLevel?: 2 | 3;
  /** glass = translucent on dark; cream = light panel with dark text. */
  readonly tone?: 'glass' | 'cream';
  readonly badge?: ReactNode;
  readonly children: ReactNode;
}

export function Card({ title, headingLevel = 2, tone = 'glass', badge, children }: CardProps) {
  const headingId = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={tone === 'cream' ? 'card card--cream' : 'card'} aria-labelledby={headingId}>
      <div className="card__header">
        <Heading id={headingId}>{title}</Heading>
        {badge ? <div className="card__badge">{badge}</div> : null}
      </div>
      {children}
    </section>
  );
}
