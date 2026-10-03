import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useFinance } from '../../../app/state/financeContext';
import { debtOverview, debtPlanView } from '../../../app/services/debtViews';
import { AppShell } from '../../../components/layout/AppShell';
import { Card, Button, EmptyState } from '../../../components/ui/Controls';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { DebtEditor } from '../../onboarding/components/DebtEditor';
import { FormDialog } from '../../../components/ui/FormDialog';
import { AsyncForm } from '../../../components/ui/AsyncForm';
import { formatMoney, formatDate } from '../../../shared/utils/presentation';

export function DebtDetailPage() {
  const { debtId } = useParams();
  const { app, data, family } = useFinance();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const navigate = useNavigate();
  if (!app || !data || !family) return null;
  const detail = debtOverview(data, app.calculators).cards.find((c) => c.debt.id === debtId);
  if (!detail)
    return (
      <AppShell>
        <main id="main" className="page-content">
          <EmptyState
            action={
              <Link to="/debts" className="text-link">
                Mis deudas
              </Link>
            }
          >
            No encontramos esta deuda.
          </EmptyState>
        </main>
      </AppShell>
    );
  const { debt, progress, payments, nextPayment } = detail;
  const money = (n: number) => formatMoney(n, data.settings?.currency ?? family.currency);
  const projection = debtPlanView({ ...data, debts: [debt] }, app.calculators, 'snowball');
  return (
    <AppShell>
      <header className="detail-hero">
        <Link to="/debts" className="back-link">
          ← Mis deudas
        </Link>
        <h1>{debt.name}</h1>
        <p>
          {debt.creditor} · {debt.annualInterestRate}% anual
        </p>
        <small>Saldo pendiente</small>
        <strong>{money(debt.remainingBalance)}</strong>
      </header>
      <main id="main" className="page-content detail-content space-y-4">
        <Card>
          <dl className="debt-facts">
            {[
              ['Monto original', money(debt.principal)],
              ['Pagado', money(progress.paidAmount)],
              ['Cuota mensual', money(debt.minimumPayment)],
              ['Tasa de interés', `${debt.annualInterestRate}% anual`],
              [
                'Próxima fecha',
                nextPayment
                  ? formatDate(nextPayment)
                  : debt.remainingBalance
                    ? 'Sin fecha definida'
                    : 'Liquidada',
              ],
              [
                'Plazo estimado',
                projection.plan ? `${projection.plan.estimatedMonths} meses` : 'No calculable',
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <ProgressBar label="Progreso pagado" value={progress.percentage} />
          <p className="muted text-xs mt-2">{Math.round(progress.percentage)}% pagado</p>
        </Card>
        <Card>
          <h2>Historial de pagos</h2>
          {payments.length ? (
            <ul className="payment-history">
              {payments.map((p) => (
                <li key={p.id}>
                  <span>✓ {formatDate(p.date)}</span>
                  <b>{money(p.amount)}</b>
                  {p.note && <small>{p.note}</small>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Sin pagos registrados.</EmptyState>
          )}
        </Card>
        <Link className="card settings-link" to="/simulator">
          <span className="tool-icon tool-color-0">🎯</span>
          <span>
            <b>¿Qué pasaría si pagara más?</b>
            <small>Simula un pago adicional →</small>
          </span>
        </Link>
        {debt.remainingBalance > 0 && (
          <Link
            className="button button-primary"
            to={`/transactions/new?kind=debt-payment&debtId=${debt.id}&returnTo=debts`}
          >
            Registrar pago
          </Link>
        )}
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Editar deuda
        </Button>
        <button type="button" className="text-link danger" onClick={() => setRemoving(true)}>
          Eliminar deuda
        </button>
      </main>
      {editing && (
        <DebtEditor
          initial={{ ...debt, dueDay: debt.dueDay ?? 1 }}
          onClose={() => setEditing(false)}
          onSave={async (input) => {
            await app.services.debts.update(debt.id, input);
            setEditing(false);
          }}
        />
      )}
      {removing && (
        <FormDialog title="Eliminar deuda" onClose={() => setRemoving(false)}>
          <AsyncForm
            label="Confirmar eliminación"
            onCancel={() => setRemoving(false)}
            onSave={async () => {
              await app.services.removeDebt(debt.id);
              void navigate('/debts', { replace: true });
            }}
          >
            <p>
              Se eliminará «{debt.name}» y sus pagos registrados. Los totales y el plan se
              recalcularán.
            </p>
          </AsyncForm>
        </FormDialog>
      )}
    </AppShell>
  );
}
