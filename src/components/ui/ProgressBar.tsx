export function ProgressBar({ value, label, className = '' }: { value: number; label: string; className?: string }) {
  return <progress className={className} max="100" value={Math.min(100, Math.max(0, value))} aria-label={label} />;
}
export function StepProgress({ step }: { step: number }) {
  return <><div className="step-bars" role="progressbar" aria-label="Progreso de configuración" aria-valuemin={0} aria-valuemax={5} aria-valuenow={step}>{[1, 2, 3, 4, 5].map(item => <span key={item} className={item <= step ? 'done' : ''} />)}</div><span className="muted text-xs">{step}/5</span></>;
}
