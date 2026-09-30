import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useFinance } from '../../../app/state/financeContext';
import { debtOverview, debtPlanView } from '../../../app/services/debtViews';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Button, Card, EmptyState } from '../../../components/ui/Controls';
import { Icon } from '../../../components/ui/Icon';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { FormDialog } from '../../../components/ui/FormDialog';
import { DebtEditor } from '../../onboarding/components/DebtEditor';
import { formatMoney, formatDate, formatMonth } from '../../../shared/utils/presentation';

export function DebtsPage() {
  const { app, data, family } = useFinance();
  const location = useLocation();
  const [adding, setAdding] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (!app || !data || !family) return <p role="status">Cargando deudas…</p>;
  const model = debtOverview(data, app.calculators);
  const projection = debtPlanView(data, app.calculators);
  const money = (amount: number) => formatMoney(amount, data.settings?.currency ?? family.currency);
  const detail = model.cards.find((card) => card.debt.id === detailId);
  const paymentUrl = (id: string) =>
    `/transactions/new?kind=debt-payment&debtId=${id}&returnTo=debts`;
  return (
    <AppShell>
      <PageHeader title="Mis deudas">
        <section className="debt-total">
          <span className="muted">Deuda total pendiente</span>
          <strong data-testid="debt-total">{money(model.total)}</strong>
          <p>
            {model.activeCount} {model.activeCount === 1 ? 'deuda activa' : 'deudas activas'}
          </p>
          <p>
            Has pagado <b>{Math.round(model.progress.percentage)}%</b> de tus deudas
          </p>
          <ProgressBar label="Progreso general de deudas" value={model.progress.percentage} />
          <small>
            Pagado {money(model.progress.paidAmount)} de {money(model.progress.originalPrincipal)}
          </small>
        </section>
      </PageHeader>
      <main id="main" className="page-content space-y-4">
        {(saved || location.state?.saved) && (
          <p role="status" className="success-notice">
            Datos guardados correctamente.
          </p>
        )}
        <Link to="/debt-plan" className="debt-plan-link">
          <div>
            <b>Ver mi plan para salir de deudas</b>
            <small>
              {projection.plan?.estimatedDebtFreeMonth
                ? `Podrías terminar en ${formatMonth(projection.plan.estimatedDebtFreeMonth)}`
                : model.activeCount
                  ? 'Revisa tus cuotas para calcular una proyección'
                  : 'No tienes deudas pendientes'}
            </small>
          </div>
          <span aria-hidden="true">›</span>
        </Link>
        {!model.cards.length && (
          <Card>
            <EmptyState icon={<Icon name="debt" />}>No tienes deudas registradas.</EmptyState>
          </Card>
        )}
        <div className="debt-grid">
          {model.cards.map(({ debt, progress, nextPayment }, index) => (
            <section
              className={`debt-card debt-color-${index % 3}`}
              key={debt.id}
              data-testid="debt-card"
            >
              <header>
                <Icon name="debt" />
                <div>
                  <h2>{debt.name}</h2>
                  <small>
                    {debt.annualInterestRate}% anual ·{' '}
                    {debt.remainingBalance > 0 ? 'Activa' : 'Liquidada'}
                  </small>
                </div>
              </header>
              <div className="debt-card-content">
                <dl className="debt-facts">
                  <div>
                    <dt>Saldo pendiente</dt>
                    <dd>{money(debt.remainingBalance)}</dd>
                  </div>
                  <div>
                    <dt>Cuota mínima mensual</dt>
                    <dd>{money(debt.minimumPayment)}</dd>
                  </div>
                  <div>
                    <dt>{debt.remainingBalance > 0 ? 'Próximo vencimiento' : 'Estado'}</dt>
                    <dd>
                      {debt.remainingBalance === 0
                        ? 'Liquidada'
                        : nextPayment
                          ? formatDate(nextPayment)
                          : `Día ${debt.dueDay} de cada mes`}
                    </dd>
                  </div>
                  <div>
                    <dt>Progreso pagado</dt>
                    <dd>{Math.round(progress.percentage)}%</dd>
                  </div>
                </dl>
                <ProgressBar label={`Progreso de ${debt.name}`} value={progress.percentage} />
                <small className="muted">Monto original: {money(debt.principal)}</small>
                <div className="debt-actions">
                  <Button
                    variant="secondary"
                    onClick={() => setDetailId(debt.id)}
                    aria-label={`Ver detalle de ${debt.name}`}
                  >
                    Ver detalle
                  </Button>
                  {debt.remainingBalance > 0 && (
                    <Link
                      className="button button-primary"
                      to={paymentUrl(debt.id)}
                      aria-label={`Registrar pago de ${debt.name}`}
                    >
                      Registrar pago
                    </Link>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
        <Button variant="ghost" onClick={() => setAdding(true)}>
          + Agregar deuda
        </Button>
      </main>
      {adding && (
        <DebtEditor
          onClose={() => setAdding(false)}
          onSave={async (input) => {
            await app.services.debts.create(input);
            setAdding(false);
            setSaved(true);
          }}
        />
      )}
      {detail && (
        <FormDialog title={detail.debt.name} onClose={() => setDetailId(null)}>
          <dl className="debt-facts">
            <div>
              <dt>Acreedor</dt>
              <dd>{detail.debt.creditor}</dd>
            </div>
            <div>
              <dt>Monto original</dt>
              <dd>{money(detail.debt.principal)}</dd>
            </div>
            <div>
              <dt>Saldo pendiente</dt>
              <dd>{money(detail.debt.remainingBalance)}</dd>
            </div>
            <div>
              <dt>Interés anual</dt>
              <dd>{detail.debt.annualInterestRate}%</dd>
            </div>
          </dl>
          <h3 className="mt-5">Pagos registrados</h3>
          {detail.payments.length ? (
            <ul className="payment-history">
              {detail.payments.map((payment) => (
                <li key={payment.id}>
                  <span>{formatDate(payment.date)}</span>
                  <b>{money(payment.amount)}</b>
                  {payment.note && <small>{payment.note}</small>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted mt-3">No hay pagos registrados para esta deuda.</p>
          )}
          {detail.debt.remainingBalance > 0 && (
            <Link className="button button-primary mt-5" to={paymentUrl(detail.debt.id)}>
              Registrar pago
            </Link>
          )}
        </FormDialog>
      )}
    </AppShell>
  );
}
