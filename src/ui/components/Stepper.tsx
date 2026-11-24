export interface StepperStep {
  readonly id: string;
  readonly label: string;
}

export interface StepperProps {
  readonly steps: readonly StepperStep[];
  readonly currentId: string;
  readonly label?: string;
}

export function Stepper({ steps, currentId, label = 'Booking progress' }: StepperProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentId);
  return (
    <nav className="stepper" aria-label={label}>
      <ol>
        {steps.map((step, i) => {
          const isCurrent = i === currentIndex;
          const isDone = currentIndex >= 0 && i < currentIndex;
          return (
            <li key={step.id} aria-current={isCurrent ? 'step' : undefined} data-state={isDone ? 'done' : undefined}>
              {step.label}
              {isDone ? <span className="visually-hidden"> (completed)</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
