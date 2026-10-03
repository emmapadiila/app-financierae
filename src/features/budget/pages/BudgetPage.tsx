import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useFinance } from '../../../app/state/financeContext';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { MonthSelector } from '../../../components/finance/MonthSelector';
import { DistributionBar } from '../../../components/finance/SummaryCard';
import { Card, Button } from '../../../components/ui/Controls';
import { FormDialog } from '../../../components/ui/FormDialog';
import { AsyncForm } from '../../../components/ui/AsyncForm';
import { CurrencyInput } from '../../../components/ui/CurrencyInput';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { formatMoney } from '../../../shared/utils/presentation';
import type { BudgetDraft } from '../services/MonthlyBudgetService';

const fields = [
  ['plannedIncome', 'Ingresos'],
  ['plannedFixedExpenses', 'Gastos fijos'],
  ['plannedVariableExpenses', 'Gastos variables'],
  ['plannedDebtPayments', 'Deudas'],
  ['plannedSavings', 'Ahorro'],
] as const;
function BudgetEditor({ initial, onClose }: { initial: BudgetDraft; onClose: () => void }) {
  const { app } = useFinance();
  const [draft, setDraft] = useState(initial);
  return (
    <FormDialog title="Planificar presupuesto" onClose={onClose}>
      <AsyncForm
        onCancel={onClose}
        label="Guardar presupuesto"
        onSave={async () => {
          await app!.services.monthlyBudget.save(draft);
          onClose();
        }}
      >
        <p className="muted text-sm">
          Estos son límites previstos. Guardarlos no registra gastos, ingresos ni pagos.
        </p>
        {fields.map(([key, label]) => (
          <CurrencyInput
            key={key}
            label={label}
            required
            value={String(draft[key])}
            onChange={(value) => setDraft({ ...draft, [key]: Number(value) })}
          />
        ))}
      </AsyncForm>
    </FormDialog>
  );
}
export function BudgetPage() {
  const { data, app, family, month, setMonth } = useFinance();
  const location = useLocation();
  const [editing, setEditing] = useState<BudgetDraft | null>(null);
  if (!app || !data || !family) return null;
  const actual = app.calculators.budget.calculate({ ...data, month });
  const saved = data.budgets.find((item) => item.month === month);
  const draft: BudgetDraft = saved ?? {
    month,
    plannedIncome: actual.income,
    plannedFixedExpenses: actual.fixedExpenses,
    plannedVariableExpenses: actual.variableExpenses,
    plannedDebtPayments: actual.debtPayments,
    plannedSavings: Math.max(0, actual.savings),
  };
  const currency = data.settings?.currency ?? family.currency;
  const values = [
    actual.income,
    actual.fixedExpenses,
    actual.variableExpenses,
    actual.debtPayments,
    actual.savings,
  ];
  const scenario = location.state?.budget as BudgetDraft | undefined;
  return (
    <AppShell>
      <PageHeader title="Mi presupuesto">
        <MonthSelector month={month} onChange={setMonth} />
        <section className="budget-summary" aria-label="Resumen real del mes">
          <dl>
            {[
              ...fields.map(([, label], i) => ({ label, value: values[i] ?? 0 })),
              { label: 'Disponible', value: actual.available },
            ].map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{formatMoney(item.value, currency)}</dd>
              </div>
            ))}
          </dl>
          <DistributionBar values={actual} />
        </section>
      </PageHeader>
      <main id="main" className="page-content space-y-4">
        <div className="section-heading">
          <h2>Límites y metas del mes</h2>
          <button type="button" className="text-link" onClick={() => setEditing(draft)}>
            Editar presupuesto
          </button>
        </div>
        {!saved && (
          <p className="reserve-note">Aún no tienes un presupuesto planificado para este mes.</p>
        )}
        <div className="budget-grid">
          {fields.map(([key, label], i) => {
            const value = values[i] ?? 0;
            const limit = saved?.[key] ?? 0;
            const percent = limit > 0 ? (value / limit) * 100 : value > 0 ? 100 : 0;
            const over = i > 0 && i < 4 && value > limit && Boolean(saved);
            return (
              <Card key={key}>
                <div className="section-heading">
                  <h2>{label}</h2>
                  <span className={over ? 'text-expense text-xs' : 'text-xs'}>
                    {formatMoney(value, currency)}{' '}
                    <span className="muted">
                      / {saved ? formatMoney(limit, currency) : 'Sin plan'}
                    </span>
                  </span>
                </div>
                <ProgressBar label={`${label}: realizado respecto al plan`} value={percent} className={over ? 'progress-over' : i>0 && i<4 && percent>=80 ? 'progress-near' : ''} />
                <p className={`text-xs mt-2 ${over ? 'text-expense' : 'muted'}`}>
                  {saved
                    ? `${limit === 0 && value > 0 ? 'Sin importe previsto' : `${Math.round(percent)}%`} · ${over ? 'Límite superado' : 'del plan'}`
                    : 'Define el valor previsto'}
                </p>
              </Card>
            );
          })}
        </div>
        <Button onClick={() => setEditing(draft)}>Planificar presupuesto</Button>
        {scenario && (
          <Card>
            <h2>Escenario del simulador</h2>
            <p className="muted text-sm my-3">
              Revisa los importes antes de guardarlos para {scenario.month}.
            </p>
            <Button
              onClick={() => {
                setMonth(scenario.month);
                setEditing(scenario);
              }}
            >
              Revisar escenario
            </Button>
          </Card>
        )}
      </main>
      {editing && <BudgetEditor initial={editing} onClose={() => setEditing(null)} />}
    </AppShell>
  );
}
