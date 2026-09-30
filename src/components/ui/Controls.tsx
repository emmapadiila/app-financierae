import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

export function Button({ children, className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function Field({ label, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return <label className={`field ${className}`} htmlFor={id}><span>{label}</span><input id={id} {...props} /></label>;
}
export function MoneyField({ label, value, onChange, prominent = false, required = false, min = 0 }: { label: string; value: string; onChange: (value: string) => void; prominent?: boolean; required?: boolean; min?: number }) {
  const id = useId();
  return <label className={`money-field ${prominent ? 'money-prominent' : ''}`} htmlFor={id}><span>{label}</span><div><span aria-hidden="true">$</span><input id={id} type="number" inputMode="decimal" min={min} max={Number.MAX_SAFE_INTEGER} step="0.01" placeholder="0" value={value} required={required} onChange={event => onChange(event.target.value)} /></div></label>;
}
export function EmptyState({ icon = null, children, action }: { icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="text-3xl" aria-hidden="true">{icon}</span><p>{children}</p>{action}</div>;
}
export function ErrorNotice({ message }: { message: string }) { return message ? <p role="alert" className="error-notice">{message}</p> : null; }
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void }) {
  return <div className="segmented" role="group" aria-label={label}>{options.map(item => <button key={item.value} type="button" aria-pressed={value === item.value} className={value === item.value ? 'selected' : ''} onClick={() => onChange(item.value)}>{item.label}</button>)}</div>;
}
