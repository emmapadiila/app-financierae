import { Link, useLocation } from 'react-router-dom';
import { useFinance } from '../../../app/state/financeContext';
import { localDate } from '../../../app/services/financeWorkspace';
import { AppShell, DeferredLink } from '../../../components/layout/AppShell';
import { Card, EmptyState } from '../../../components/ui/Controls';
import { Icon } from '../../../components/ui/Icon';
import { MonthSelector } from '../../../components/finance/MonthSelector';
import { SummaryCard } from '../../../components/finance/SummaryCard';
import { ExpenseChart } from '../../../components/finance/ExpenseChart';
import { categoryIcon } from '../../../shared/utils/categories';
import { formatDate, formatMoney } from '../../../shared/utils/presentation';
import { addMonthsToMonth } from '../../../shared/utils/dates';

export function DashboardPage() {
  const { data, app, family, month, setMonth, dark, toggleTheme } = useFinance();
  const location = useLocation();
  if (!data || !app || !family) return null;
  const today = localDate();
  const asOfDate = month === today.slice(0, 7) ? today : `${month}-01`;
  const summary = app.calculators.financialSummary.calculate({ ...data, month, asOfDate });
  const budget = app.calculators.budget.calculate({ ...data, month });
  const previous = app.calculators.budget.calculate({ ...data, month: addMonthsToMonth(month, -1) });
  const plan = data.budgets.find(item => item.month === month);
  const currency = data.settings?.currency ?? family.currency;
  const money = (value: number) => formatMoney(value, currency);
  const delta = (value: number, before: number) => before > 0 ? `${value >= before ? '+' : ''}${Math.round((value - before) / before * 100)}%` : null;
  const cards = [
    { name: 'Ingresos', icon: '💰', amount: summary.totalIncome, color: 'text-brand', badge: delta(summary.totalIncome, previous.income) },
    { name: 'Gastos', icon: '🛒', amount: summary.totalExpenses, color: '', badge: delta(summary.totalExpenses, previous.expenses) },
    { name: 'Deudas', icon: '💳', amount: summary.totalDebt, color: 'text-expense', badge: 'Saldo total' },
    { name: 'Ahorros', icon: '🐷', amount: summary.totalSavings, color: 'text-saving', badge: 'Acumulado' },
  ];
  return <AppShell><header className="page-header"><div className="flex items-center justify-between gap-3"><div><p className="muted text-sm">Hola <span aria-hidden="true">👋</span></p><h1>Así van tus finanzas</h1></div><div className="flex items-center gap-3"><button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={dark ? 'Activar tema claro' : 'Activar tema oscuro'}><Icon name={dark ? 'sun' : 'moon'} /></button><span className="avatar" aria-label={family.name}>MF</span></div></div><MonthSelector month={month} onChange={setMonth} /></header><main id="main" className="page-content space-y-4">{location.state?.saved && <p role="status" className="success-notice">Movimiento guardado. Tus finanzas están actualizadas.</p>}<SummaryCard values={budget} currency={currency} />{plan && plan.plannedSavings > 0 && <p className="reserve-note">Reserva prevista de ahorro: <b>{money(plan.plannedSavings)}</b>. Aportes realizados este mes: <b>{money(budget.savings)}</b>.</p>}
    {!data.incomes.length && <Card><EmptyState icon="💰" action={<Link className="text-link" to="/transactions/new?kind=income">Agregar ingreso →</Link>}>Agrega tu primer ingreso para comenzar.</EmptyState></Card>}
    <div className="grid grid-cols-2 gap-3">{cards.map(item => <Card key={item.name} className="stat-card"><div className="flex items-center justify-between gap-2"><span className="text-2xl" aria-hidden="true">{item.icon}</span>{item.badge && <span className={`stat-badge ${item.name === 'Deudas' ? 'badge-red' : ''}`}>{item.badge}</span>}</div><strong className={item.color}>{money(item.amount)}</strong><span className="muted text-sm">{item.name}</span></Card>)}</div>
    <div className="dashboard-detail-grid"><Card><div className="section-heading"><h2>Próximos pagos</h2><DeferredLink>Ver calendario →</DeferredLink></div>{summary.upcomingPayments.length ? <ul className="payment-list">{summary.upcomingPayments.slice(0, 4).map(payment => <li key={`${payment.kind}-${payment.id}`}><span className="item-icon" aria-hidden="true">{payment.kind === 'debt' ? '💳' : categoryIcon(payment.description)}</span><div className="min-w-0 flex-1"><p className="truncate">{payment.description}</p><small className="muted">Vence {formatDate(payment.dueDate)}</small></div><div className="text-right"><b>{money(payment.amount)}</b><span className="status-badge">{payment.dueDate === today ? 'Hoy' : 'Próximo'}</span></div></li>)}</ul> : <EmptyState icon="📅">No tienes pagos pendientes en los próximos 30 días desde la fecha consultada.</EmptyState>}</Card><Card><h2 className="mb-5">¿En qué estás gastando?</h2><ExpenseChart items={summary.expenseDistribution} currency={currency} /><Link className="text-link block text-center mt-5" to="/transactions?filter=expense">Ver todos los gastos →</Link></Card></div>
    {!data.debts.length && <p className="muted text-xs text-center">No tienes deudas registradas.</p>}
    <div className="quick-actions"><Link to="/transactions/new?kind=expense" className="quick-expense"><span aria-hidden="true">＋</span>Agregar<br />gasto</Link><div className="quick-debt"><span aria-hidden="true">💳</span><DeferredLink>Ver deudas</DeferredLink></div><div className="quick-plan"><span aria-hidden="true">🎯</span><DeferredLink>Mi plan</DeferredLink></div></div></main></AppShell>;
}
