import { useId, type ReactNode } from 'react';

export interface CardProps {
  readonly title: string;
  readonly headingLevel?: 2 | 3;
  /** glass = translucent on dark; cream = light panel with dark text. */
  readonly tone?: 'glass' | 'cream';
  readonly children: ReactNode;
}

export function Card({ title, headingLevel = 2, tone = 'glass', children }: CardProps) {
  const headingId = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={tone === 'cream' ? 'card card--cream' : 'card'} aria-labelledby={headingId}>
      <Heading id={headingId}>{title}</Heading>
      {children}
    </section>
  );
}
