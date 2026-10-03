import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFinance } from '../../../app/state/financeContext';
import { calendarEvents } from '../../../app/services/calendarModel';
import { localDate } from '../../../app/services/financeWorkspace';
import { monthRange } from '../../../shared/utils/dates';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { MonthSelector } from '../../../components/finance/MonthSelector';
import { Card, EmptyState, ErrorNotice } from '../../../components/ui/Controls';
import { errorMessage, formatDate, formatMoney } from '../../../shared/utils/presentation';
const labels = {
  paid: 'Pagado',
  upcoming: 'Próximo',
  overdue: 'Vencido',
  income: 'Ingreso',
  planned: 'Programado',
};
export function CalendarPage() {
  const { data, app, family, month, setMonth } = useFinance();
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!data || !app || !family) return null;
  const events = calendarEvents(data, month);
  const days = Number(monthRange(month).end.slice(8));
  const weekStart = data.settings?.weekStartsOn ?? 1;
  const offset = (new Date(`${month}-01T12:00:00Z`).getUTCDay() - weekStart + 7) % 7;
  const today = localDate();
  const filtered = selected.startsWith(month) ? events.filter((e) => e.date === selected) : events;
  async function markPaid(id: string) {
    if (busy || !app) return;
    setBusy(true);
    setError('');
    try {
      await app.services.expenses.markAsPaid(id);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell>
      <PageHeader title="Calendario financiero">
        <MonthSelector
          month={month}
          onChange={(value) => {
            setMonth(value);
            setSelected('');
          }}
        />
      </PageHeader>
      <main id="main" className="page-content space-y-4">
        <div className="calendar-legend">
          {Object.entries(labels).map(([status, label]) => (
            <span key={status}>
              <i className={`event-dot event-${status}`} />
              {label}
            </span>
          ))}
        </div>
        <div className="dashboard-detail-grid">
          <Card>
            <div className="calendar-grid">
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i} className="muted">
                  {['D', 'L', 'M', 'X', 'J', 'V', 'S'][(weekStart + i) % 7]}
                </span>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <span key={`blank-${i}`} />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const date = `${month}-${String(i + 1).padStart(2, '0')}`;
                const items = events.filter((e) => e.date === date);
                return (
                  <button
                    key={date}
                    type="button"
                    className={`${date === today ? 'today' : ''} ${selected === date ? 'selected' : ''}`}
                    aria-pressed={selected === date}
                    aria-label={`${formatDate(date)}, ${items.length} eventos`}
                    onClick={() => setSelected(selected === date ? '' : date)}
                  >
                    <span>{i + 1}</span>
                    <span className="day-dots">
                      {[...new Set(items.map((e) => e.status))].map((status) => (
                        <i key={status} className={`event-dot event-${status}`} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            {selected.startsWith(month) && (
              <button type="button" className="text-link mt-3" onClick={() => setSelected('')}>
                Ver todo el mes
              </button>
            )}
          </Card>
          <Card>
            <h2>{selected.startsWith(month) ? formatDate(selected) : 'Eventos este mes'}</h2>
            {!filtered.length ? (
              <EmptyState>No hay eventos para este período.</EmptyState>
            ) : (
              <ul className="calendar-events">
                {filtered.map((event) => (
                  <li key={event.id}>
                    <span className="calendar-day">{Number(event.date.slice(8))}</span>
                    <div>
                      <b>{event.name}</b>
                      <small className={`event-label event-text-${event.status}`}>
                        {labels[event.status]}
                      </small>
                      {event.kind === 'expense' && event.status !== 'paid' && (
                        <button
                          className="text-link"
                          type="button"
                          disabled={busy}
                          onClick={() => void markPaid(event.entityId)}
                        >
                          Marcar pagado
                        </button>
                      )}
                      {(event.kind === 'debt' || event.kind === 'payment') && (
                        <Link className="text-link" to={`/debts/${event.entityId}`}>
                          Ver deuda
                        </Link>
                      )}
                    </div>
                    <strong>
                      {formatMoney(event.amount, data.settings?.currency ?? family.currency)}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
            <ErrorNotice message={error} />
          </Card>
        </div>
        <p className="reserve-note">
          Los ingresos muestran su fecha registrada. Los vencimientos programados de deudas son
          recordatorios; consulta el historial para comprobar los pagos.
        </p>
      </main>
    </AppShell>
  );
}
