import { useFinance } from '../../../app/state/financeContext';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { MonthSelector } from '../../../components/finance/MonthSelector';
import { ExpenseChart } from '../../../components/finance/ExpenseChart';
import { Card } from '../../../components/ui/Controls';
import { addMonthsToMonth } from '../../../shared/utils/dates';
import { formatMoney, formatMonth } from '../../../shared/utils/presentation';
export function ReportsPage() {
  const { app, data, family, month, setMonth } = useFinance();
  if (!app || !data || !family) return null;
  const months = [-2, -1, 0].map((n) => addMonthsToMonth(month, n));
  const rows = months.map((m) => app.calculators.budget.calculate({ ...data, month: m }));
  const current = rows[2]!;
  const previous = rows[1]!;
  const summary = app.calculators.financialSummary.calculate({
    ...data,
    month,
    asOfDate: `${month}-01`,
  });
  const currency = data.settings?.currency ?? family.currency;
  const money = (n: number) => formatMoney(n, currency);
  const max = Math.max(1, ...rows.flatMap((r) => [r.income, r.expenses]));
  const diff = current.expenses - previous.expenses;
  return (
    <AppShell>
      <PageHeader title="Resumen del mes">
        <MonthSelector month={month} onChange={setMonth} />
      </PageHeader>
      <main id="main" className="page-content space-y-4">
        <Card>
          <h2>📊 Vs. mes anterior</h2>
          <div className="report-comparison">
            {[
              { label: formatMonth(previous.month), value: previous.expenses, sub: 'gastos' },
              { label: formatMonth(month), value: current.expenses, sub: 'gastos' },
              {
                label: 'Diferencia',
                value: diff,
                sub: previous.expenses
                  ? `${Math.round((diff / previous.expenses) * 100)}%`
                  : 'Sin base de comparación',
              },
            ].map((r, i) => (
              <div key={r.label} className={i === 1 ? 'highlight' : ''}>
                <small>{r.label}</small>
                <strong>{money(r.value)}</strong>
                <small>{r.sub}</small>
              </div>
            ))}
          </div>
        </Card>
        <div className="dashboard-detail-grid">
          <Card>
            <h2>Ingresos vs Gastos</h2>
            <div className="calendar-legend my-3">
              <span>
                <i className="event-dot event-paid" />
                Ingresos
              </span>
              <span>
                <i className="event-dot event-overdue" />
                Gastos
              </span>
            </div>
            <div
              className="report-bars"
              role="img"
              aria-label={rows
                .map(
                  (r) =>
                    `${formatMonth(r.month)}: ingresos ${money(r.income)}, gastos ${money(r.expenses)}`,
                )
                .join('. ')}
            >
              {rows.map((r) => (
                <div key={r.month}>
                  <div className="bar-pair">
                    <span
                      title={`Ingresos: ${money(r.income)}`}
                      style={{ height: `${(r.income / max) * 100}%` }}
                    />
                    <span
                      title={`Gastos: ${money(r.expenses)}`}
                      style={{ height: `${(r.expenses / max) * 100}%` }}
                    />
                  </div>
                  <small>{formatMonth(r.month).split(' ')[0]}</small>
                </div>
              ))}
            </div>
            <details className="mt-4">
              <summary>Ver importes</summary>
              <ul className="payment-history">
                {rows.map((r) => (
                  <li key={r.month}>
                    <span>{formatMonth(r.month)}</span>
                    <small>
                      Ingresos {money(r.income)} · Gastos {money(r.expenses)}
                    </small>
                  </li>
                ))}
              </ul>
            </details>
          </Card>
          <Card>
            <h2 className="mb-4">Distribución de gastos</h2>
            <ExpenseChart items={summary.expenseDistribution} currency={currency} />
          </Card>
        </div>
        <div className="responsive-grid">
          <Card>
            <p>🐷 Ahorro neto del mes</p>
            <strong className="scenario-months text-brand">{money(current.savings)}</strong>
          </Card>
          <Card>
            <p>💳 Deuda total actual</p>
            <strong className="scenario-months">{money(summary.totalDebt)}</strong>
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
