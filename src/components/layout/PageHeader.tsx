import type { ReactNode } from 'react';
export function PageHeader({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children?: ReactNode }) {
  return <header className="page-header"><div className="flex items-center justify-between gap-3"><div>{subtitle && <p className="muted text-sm mb-1">{subtitle}</p>}<h1>{title}</h1></div>{actions}</div>{children}</header>;
}
