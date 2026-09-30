import type { ExpenseDistributionItem } from '../../features/dashboard/services/FinancialSummaryCalculator';
import { formatMoney } from '../../shared/utils/presentation';
import { EmptyState } from '../ui/Controls';
const colors = ['#16a34a', '#3b82f6', '#f59e0b', '#f24452', '#8b5cf6', '#14b8a6'];
export function ExpenseChart({ items, currency }: { items: ExpenseDistributionItem[]; currency: string }) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  if (!total) return <EmptyState icon="🛒">Todavía no tienes gastos registrados este mes.</EmptyState>;
  const segments = items.map((item, index) => {
    const start = items.slice(0, index).reduce((sum, previous) => sum + previous.percentage, 0);
    return `${colors[index % colors.length]} ${start}% ${start + item.percentage}%`;
  });
  return <div className="expense-chart"><div className="donut" role="img" aria-label={`Gastos del mes: ${formatMoney(total, currency)}. Detalle por categoría en la lista.`} style={{ background: `conic-gradient(${segments.join(',')})` }}><div><b>{formatMoney(total, currency)}</b><span>total</span></div></div><ul className="chart-legend">{items.map((item, index) => <li key={item.categoryId ?? 'none'}><i style={{ backgroundColor: colors[index % colors.length] }} /><div><span>{item.categoryName}</span><div className="mini-progress"><span style={{ width: `${item.percentage}%`, backgroundColor: colors[index % colors.length] }} /></div></div><b>{Math.round(item.percentage)}%</b></li>)}</ul></div>;
}
