import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFinance } from '../../../app/state/financeContext';
import { debtPlanView } from '../../../app/services/debtViews';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Card, EmptyState, ErrorNotice } from '../../../components/ui/Controls';
import { CurrencyInput } from '../../../components/ui/CurrencyInput';
import { errorMessage, formatMoney, formatMonth } from '../../../shared/utils/presentation';
import type { DebtSimulatorResult } from '../services/DebtSimulator';

export function SimulatorPage() {
  const { data, app, family, month } = useFinance();
  const [extra, setExtra] = useState('0');
  const [income, setIncome] = useState('0');
  const [reduction, setReduction] = useState('0');
  if (!data || !app || !family) return null;
  const budget = app.calculators.budget.calculate({ ...data, month });
  const plan = debtPlanView(data, app.calculators);
  const debts = data.debts.filter((d) => d.remainingBalance > 0);
  let result: DebtSimulatorResult | null = null;
  let error = '';
  try {
    result = app.calculators.debtSimulator.simulate({
      debts,
      monthlyIncome: budget.income,
      monthlyExpenses: budget.expenses,
      currentExtraDebtPayment: 0,
      changes: {
        incomeIncrease: Number(income),
        expenseReduction: Number(reduction),
        debtPaymentIncrease: Number(extra),
      },
      strategy: data.settings?.debtPlan?.strategy ?? 'snowball',
      startMonth: plan.startMonth,
      customOrder: plan.customOrder,
    });
  } catch (reason) {
    error = errorMessage(reason);
  }
  const money = (n: number) => formatMoney(n, data.settings?.currency ?? family.currency);
  const controls = [
    {
      label: 'Pago adicional mensual',
      value: extra,
      set: setExtra,
      max: Math.max(budget.income, 1),
    },
    {
      label: 'Ingreso extra mensual',
      value: income,
      set: setIncome,
      max: Math.max(budget.income, 1),
    },
    { label: 'Reducción de gastos', value: reduction, set: setReduction, max: budget.expenses },
  ];
  const variableReduction = Math.min(Number(reduction), budget.variableExpenses);
  return (
    <AppShell>
      <PageHeader title="¿Qué pasaría si...?">
        <Link className="text-link" to="/debt-plan">
          ← Mi plan
        </Link>
        <p className="muted text-sm mt-2">Ajusta los escenarios y ve cómo cambia tu plan.</p>
      </PageHeader>
      <main id="main" className="page-content space-y-4">
        {!debts.length ? (
          <Card>
            <EmptyState
              icon="🎯"
              action={
                <Link to="/debts" className="text-link">
                  Ver mis deudas
                </Link>
              }
            >
              No tienes deudas pendientes para simular.
            </EmptyState>
          </Card>
        ) : (
          <>
            <div className="responsive-grid">
              <Card>
                <p className="muted text-xs">Plan actual</p>
                <strong className="scenario-months">
                  {result?.current.estimatedMonths ?? '—'}
                </strong>
                <p className="muted text-xs">meses</p>
              </Card>
              <section className="card scenario-result">
                <p className="text-xs">Con este cambio</p>
                <strong className="scenario-months" data-testid="simulated-months">
                  {result?.simulated.estimatedMonths ?? '—'}
                </strong>
                <p className="text-xs">meses</p>
              </section>
            </div>
            {result && (
              <Card>
                <h2>
                  {result.monthsDifference > 0
                    ? `${result.monthsDifference} meses menos`
                    : 'Sin reducción de plazo'}
                </h2>
                <p className="muted text-sm mt-2">
                  {result.simulated.estimatedDate
                    ? `Terminarías en ${formatMonth(result.simulated.estimatedDate)}`
                    : 'Sin saldo pendiente'}
                  . Pago adicional posible: {money(result.simulated.extraDebtPayment)}.
                </p>
              </Card>
            )}
            <div className="budget-grid">
              {controls.map((c) => (
                <Card key={c.label}>
                  <CurrencyInput label={c.label} value={c.value} onChange={c.set} />
                  <input
                    className="scenario-range"
                    type="range"
                    aria-label={`Ajustar ${c.label.toLowerCase()}`}
                    min={0}
                    max={c.max}
                    step={1}
                    value={Math.min(Number(c.value), c.max)}
                    onChange={(e) => c.set(e.target.value)}
                  />
                  <div className="flex justify-between muted text-xs">
                    <span>{money(0)}</span>
                    <span>{money(c.max)}</span>
                  </div>
                </Card>
              ))}
            </div>
            <ErrorNotice message={error} />
            {result && (
              <>
                <p className="reserve-note">
                  {result.disclaimer} No cambia tus registros. El pago adicional se limita al dinero
                  disponible según los ingresos y gastos del escenario.
                </p>
                <Link
                  className="button button-primary"
                  to="/budget"
                  state={{
                    budget: {
                      month,
                      plannedIncome: budget.income + Number(income),
                      plannedFixedExpenses:
                        budget.fixedExpenses - (Number(reduction) - variableReduction),
                      plannedVariableExpenses: budget.variableExpenses - variableReduction,
                      plannedDebtPayments:
                        debts.reduce((s, d) => s + d.minimumPayment, 0) +
                        result.simulated.extraDebtPayment,
                      plannedSavings:
                        data.budgets.find((b) => b.month === month)?.plannedSavings ??
                        Math.max(0, budget.savings),
                    },
                  }}
                >
                  Aplicar al presupuesto
                </Link>
              </>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
