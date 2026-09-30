import { Icon, type IconName } from './Icon';
const categoryIcons: Record<string, IconName> = { Energía: 'energy', Agua: 'water', Gas: 'flame', Internet: 'globe', Alimentación: 'cart', Servicios: 'globe', Transporte: 'car', Arriendo: 'home', Vivienda: 'home', Educación: 'education', Ingreso: 'wallet', Deuda: 'debt' };
export function FinanceIcon({ name, category, className = '' }: { name?: IconName; category?: string; className?: string }) {
  const icon = name ?? categoryIcons[category ?? ''] ?? 'movements';
  return <span className={`finance-icon icon-${icon} ${className}`}><Icon name={icon} /></span>;
}
