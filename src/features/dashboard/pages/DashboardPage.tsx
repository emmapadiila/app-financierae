import { Link } from 'react-router-dom';
import { useDashboard } from '../hooks/useDashboard';
import { AppShell, DeferredLink } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Card, EmptyState } from '../../../components/ui/Controls';
import { Icon, type IconName } from '../../../components/ui/Icon';
import { FinanceIcon } from '../../../components/ui/FinanceIcon';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { MonthSelector } from '../../../components/finance/MonthSelector';
import { SummaryCard } from '../../../components/finance/SummaryCard';
import { ExpenseChart } from '../../../components/finance/ExpenseChart';
import { formatDate, formatMoney } from '../../../shared/utils/presentation';

export function DashboardPage() {
  const dashboard = useDashboard();
  if (!dashboard) return null;
  const { data, family, month, setMonth, dark, toggleTheme, model, currency } = dashboard;
  const { summary, budget, savingsProgress } = model;
  const money = (value: number) => formatMoney(value, currency);
  const changeLabel = (value: number | null) => value === null ? null : `${value >= 0 ? '+' : ''}${value}%`;
  const cards: { name: string; icon: IconName; amount: number; color: string; badge: string | null }[] = [
    { name: 'Ingresos', icon: 'wallet', amount: summary.totalIncome, color: 'text-brand', badge: changeLabel(model.incomeChange) },
    { name: 'Gastos', icon: 'cart', amount: summary.totalExpenses, color: '', badge: changeLabel(model.expenseChange) },
    { name: 'Deudas', icon: 'debt', amount: summary.totalDebt, color: 'text-expense', badge: 'Saldo total' },
    { name: 'Ahorros', icon: 'savings', amount: summary.totalSavings, color: 'text-saving', badge: savingsProgress ? `${Math.round(savingsProgress.progressPercent)}%` : null },
  ];
  return <AppShell><PageHeader title="Así van tus finanzas" subtitle="Hola" actions={<div className="flex items-center gap-3"><button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={dark ? 'Activar tema claro' : 'Activar tema oscuro'}><Icon name={dark ? 'sun' : 'moon'} /></button><span className="avatar" aria-label={family.name}>MF</span></div>}><MonthSelector month={month} onChange={setMonth} /></PageHeader><main id="main" className="page-content space-y-4">
    <SummaryCard values={budget} currency={currency} />
    {!data.incomes.length && <Card><EmptyState icon={<FinanceIcon name="wallet" />}>Agrega tu primer ingreso para comenzar.</EmptyState></Card>}
    <div className="grid grid-cols-2 gap-3">{cards.map(item => <Card key={item.name} className="stat-card"><div className="flex items-center justify-between gap-2"><FinanceIcon name={item.icon} />{item.badge && <span className={`stat-badge ${item.name === 'Deudas' ? 'badge-red' : item.name === 'Ahorros' ? 'badge-blue' : ''}`} title={item.name === 'Ingresos' || item.name === 'Gastos' ? 'Variación respecto al mes anterior' : undefined}>{item.badge}</span>}</div><strong className={item.color}>{money(item.amount)}</strong><span className="muted text-sm">{item.name}</span></Card>)}</div>
    <div className="dashboard-detail-grid"><Card><div className="section-heading"><h2>Próximos pagos</h2><DeferredLink>Ver calendario →</DeferredLink></div>{model.upcomingPayments.length ? <ul className="payment-list">{model.upcomingPayments.slice(0, 4).map(payment => <li key={`${payment.kind}-${payment.id}`}><FinanceIcon category={payment.kind === 'debt' ? 'Deuda' : payment.description} /><div className="min-w-0 flex-1"><p className="truncate">{payment.description}</p><small className="muted">Vence {formatDate(payment.dueDate)}</small></div><div className="text-right"><b>{money(payment.amount)}</b><span className="status-badge">{payment.status}</span></div></li>)}</ul> : <EmptyState icon={<FinanceIcon name="calendar" />}>No tienes pagos pendientes en los próximos 30 días desde la fecha consultada.</EmptyState>}</Card>
    <Card><h2 className="mb-5">¿En qué estás gastando?</h2><ExpenseChart items={summary.expenseDistribution} currency={currency} /><div className="text-center mt-5"><Link className="text-link" to="/transactions?filter=expense">Ver todos los gastos →</Link></div></Card></div>
    {data.debts.length > 0 ? <Card><div className="section-heading"><h2>Progreso de tus deudas</h2><span className="text-brand text-sm">{Math.round(summary.debtProgress.percentage)}%</span></div><ProgressBar label="Deuda pagada" value={summary.debtProgress.percentage} /><p className="muted text-xs mt-2">Has reducido {money(summary.debtProgress.paidAmount)} de {money(summary.debtProgress.originalPrincipal)}.</p></Card> : <p className="muted text-xs text-center">No tienes deudas registradas.</p>}
    {model.plannedSavings > 0 && <p className="reserve-note">Reserva mensual prevista: <b>{money(model.plannedSavings)}</b>. Ahorro apartado este mes: <b>{money(budget.savings)}</b>.</p>}
    {!data.savingsGoals.length && <p className="muted text-xs text-center">Aún no tienes metas de ahorro.</p>}
    <div className="quick-actions"><Link to="/transactions/new?kind=expense" className="quick-expense"><Icon name="plus" /><span>Agregar<br />gasto</span></Link><DeferredLink className="quick-debt"><Icon name="debt" /><span>Ver<br />deudas</span></DeferredLink><DeferredLink className="quick-plan"><Icon name="target" /><span>Mi<br />plan</span></DeferredLink></div>
  </main></AppShell>;
}
