import type { ReactNode } from 'react';

export type NoticeTone = 'info' | 'success' | 'error' | 'warning';

export interface NoticeProps {
  readonly tone?: NoticeTone;
  readonly title?: string;
  readonly children: ReactNode;
}

export function Notice({ tone = 'info', title, children }: NoticeProps) {
  // role="alert" is implicitly assertive; everything else is a polite status.
  const isError = tone === 'error';
  return (
    <div
      className={`notice notice--${tone}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? undefined : 'polite'}
    >
      {title ? <strong className="notice__title">{title}</strong> : null}
      {children}
    </div>
  );
}
