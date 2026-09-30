import { useState } from 'react';
import type { Debt } from '../../../domain/models/financial';
import type { debtPlanView } from '../../../app/services/debtViews';
import { Button, Card } from '../../../components/ui/Controls';
import { Icon } from '../../../components/ui/Icon';
import { formatMoney, formatMonth } from '../../../shared/utils/presentation';

export function DebtTimeline({
  model,
  debts,
  currency,
}: {
  model: ReturnType<typeof debtPlanView>;
  debts: Debt[];
  currency: string;
}) {
  const [visible, setVisible] = useState(12);
  const name = (id: string) => debts.find((debt) => debt.id === id)?.name ?? 'Deuda';
  const money = (amount: number) => formatMoney(amount, currency);
  return (
    <section aria-label="Línea de tiempo">
      <h2 className="mb-4">Línea de tiempo</h2>
      <ol className="debt-timeline">
        {model.timeline.slice(0, visible).map((month, index) => (
          <li key={month.month}>
            <span className={`timeline-marker ${month.settled.length ? 'settled' : ''}`}>
              {month.settled.length ? <Icon name="check" /> : index + 1}
            </span>
            <Card>
              <small className="muted">{formatMonth(month.month)}</small>
              <div className="timeline-heading">
                <b>
                  {month.remainingDebt === 0
                    ? '¡Libre de deudas!'
                    : month.priorityId
                      ? name(month.priorityId)
                      : 'Pagos del mes'}
                </b>
                <span>
                  {money(
                    month.payments.find((payment) => payment.debtId === month.priorityId)
                      ?.payment ?? month.totalPayment,
                  )}
                </span>
              </div>
              {month.priorityId && (
                <p className="muted text-xs">Prioridad: {name(month.priorityId)}</p>
              )}
              {month.settled.map((id) => (
                <p key={id} className="text-brand text-sm">
                  {name(id)} liquidada · cuota liberada:{' '}
                  {money(debts.find((debt) => debt.id === id)?.minimumPayment ?? 0)}
                </p>
              ))}
              <p className="muted text-xs mt-2">
                Total de pagos del mes: {money(month.totalPayment)}
              </p>
              <p className="muted text-xs">Saldo proyectado: {money(month.remainingDebt)}</p>
              <details>
                <summary>Detalle de pagos</summary>
                <ul>
                  {month.payments
                    .filter((payment) => payment.startingBalance > 0)
                    .map((payment) => (
                      <li key={payment.debtId}>
                        <b>{name(payment.debtId)}</b>
                        <span>
                          Pago: {money(payment.payment)} · Interés: {money(payment.interest)} ·
                          Saldo: {money(payment.remainingBalance)}
                        </span>
                      </li>
                    ))}
                </ul>
              </details>
            </Card>
          </li>
        ))}
      </ol>
      {visible < model.timeline.length && (
        <Button variant="secondary" onClick={() => setVisible((value) => value + 12)}>
          Mostrar más meses ({model.timeline.length - visible} restantes)
        </Button>
      )}
    </section>
  );
}
