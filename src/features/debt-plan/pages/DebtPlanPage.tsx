import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFinance } from '../../../app/state/financeContext';
import { debtPlanView } from '../../../app/services/debtViews';
import type { DebtPlanStrategy } from '../services/DebtPlanner';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Card, EmptyState, ErrorNotice } from '../../../components/ui/Controls';
import { Icon } from '../../../components/ui/Icon';
import { formatMoney, formatMonth, errorMessage } from '../../../shared/utils/presentation';
import { DebtTimeline } from '../components/DebtTimeline';

const strategies: { value: DebtPlanStrategy; label: string; description: string }[] = [
  {
    value: 'snowball',
    label: 'Bola de nieve',
    description: 'Empieza por las deudas con menor saldo.',
  },
  { value: 'avalanche', label: 'Avalancha', description: 'Prioriza las deudas con mayor interés.' },
  {
    value: 'custom',
    label: 'Personalizado',
    description: 'Tú decides el orden de pago según tus prioridades.',
  },
];
export function DebtPlanPage() {
  const { app, data, family } = useFinance();
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  if (!app || !data || !family) return <p role="status">Calculando tu plan…</p>;
  const strategy = data.settings?.debtPlan?.strategy ?? 'snowball';
  const model = debtPlanView(data, app.calculators);
  const active = data.debts.filter((debt) => debt.remainingBalance > 0);
  const currency = data.settings?.currency ?? family.currency;
  async function choose(next: DebtPlanStrategy, order = model.customOrder) {
    if (lock.current || !app || !data || !family) return;
    lock.current = true;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await app.services.financialSettings.update({
        currency: data.settings?.currency ?? family.currency,
        locale: data.settings?.locale ?? 'es-CO',
        weekStartsOn: data.settings?.weekStartsOn ?? 1,
        debtPlan: { strategy: next, customOrder: order },
      });
      setSaved(true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  function move(index: number, direction: number) {
    const order = [...model.customOrder];
    const other = index + direction;
    if (!order[index] || !order[other]) return;
    [order[index], order[other]] = [order[other]!, order[index]!];
    void choose('custom', order);
  }
  return (
    <AppShell>
      <PageHeader title="Tu plan para salir de deudas">
        <p className="muted text-sm mt-2">Proyección con tus saldos y cuotas actuales</p>
      </PageHeader>
      <main id="main" className="page-content space-y-4">
        {!active.length ? (
          <Card>
            <EmptyState
              icon={<Icon name="party" />}
              action={
                <Link className="text-link" to="/debts">
                  Ver mis deudas
                </Link>
              }
            >
              {data.debts.length
                ? 'Todas tus deudas están liquidadas.'
                : 'No tienes deudas registradas.'}
            </EmptyState>
          </Card>
        ) : (
          <>
            {model.plan ? (
              <section className="plan-goal">
                <Icon name="target" />
                <span>Meta estimada</span>
                <h2>
                  Libre de deudas en{' '}
                  <strong data-testid="plan-months">
                    {model.plan.estimatedMonths}{' '}
                    {model.plan.estimatedMonths === 1 ? 'mes' : 'meses'}
                  </strong>
                </h2>
                <p>
                  Fecha estimada:{' '}
                  <b>
                    {model.plan.estimatedDebtFreeMonth
                      ? formatMonth(model.plan.estimatedDebtFreeMonth)
                      : 'Sin deuda pendiente'}
                  </b>
                </p>
                <small>
                  Intereses proyectados: {formatMoney(model.plan.totalInterest, currency)}
                </small>
              </section>
            ) : (
              <Card>
                <h2>No podemos estimar una fecha de liquidación</h2>
                <ErrorNotice message={model.error} />
                <p className="muted">
                  Revisa las cuotas e intereses registrados. No se ha generado una fecha estimada.
                </p>
              </Card>
            )}
            <p className="muted text-xs">
              Desde {formatMonth(model.startMonth)}. Se mantienen tus cuotas mínimas mensuales y se
              reasignan las cuotas liberadas. No se supone ningún aporte adicional ni se garantiza
              que el presupuesto alcance para las cuotas.
            </p>
            <fieldset disabled={saving} className="space-y-3">
              <legend className="mb-3">¿Cómo quieres organizar tus deudas?</legend>
              {strategies.map((option) => (
                <button
                  type="button"
                  className={`strategy-card ${strategy === option.value ? 'selected' : ''}`}
                  aria-pressed={strategy === option.value}
                  aria-label={option.label}
                  key={option.value}
                  onClick={() => void choose(option.value)}
                >
                  <Icon
                    name={
                      option.value === 'custom'
                        ? 'menu'
                        : option.value === 'snowball'
                          ? 'target'
                          : 'plan'
                    }
                  />
                  <span>
                    <b>{option.label}</b>
                    <small>{option.description}</small>
                  </span>
                  {strategy === option.value && <Icon name="check" />}
                </button>
              ))}
              {strategy === 'custom' && (
                <ol className="custom-debt-order" aria-label="Orden personalizado">
                  {model.customOrder.map((id, index) => (
                    <li key={id}>
                      <span>
                        {index + 1}. {data.debts.find((debt) => debt.id === id)?.name}
                      </span>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        aria-label={`Subir ${data.debts.find((debt) => debt.id === id)?.name}`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === model.customOrder.length - 1}
                        onClick={() => move(index, 1)}
                        aria-label={`Bajar ${data.debts.find((debt) => debt.id === id)?.name}`}
                      >
                        ↓
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </fieldset>
            {saving && <p role="status">Guardando estrategia…</p>}
            {saved && !saving && (
              <p role="status" className="success-notice">
                Estrategia guardada.
              </p>
            )}
            <ErrorNotice message={error} />
            {model.plan && (
              <DebtTimeline
                key={`${strategy}-${model.customOrder.join(',')}-${data.debtPayments.length}`}
                model={model}
                debts={data.debts}
                currency={currency}
              />
            )}
            {model.plan && <p className="muted text-xs">{model.plan.disclaimer}</p>}
          </>
        )}
        <Link to="/debts" className="text-link">
          Volver a mis deudas
        </Link>
      </main>
    </AppShell>
  );
}
