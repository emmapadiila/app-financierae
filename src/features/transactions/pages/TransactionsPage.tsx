import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useFinance } from '../../../app/state/financeContext';
import { localDate } from '../../../app/services/financeWorkspace';
import { filteredMovementHistory } from '../../../app/services/movementHistory';
import { AppShell } from '../../../components/layout/AppShell';
import { Card, EmptyState, Segmented } from '../../../components/ui/Controls';
import { Icon } from '../../../components/ui/Icon';
import { MonthSelector } from '../../../components/finance/MonthSelector';
import { formatDate, formatMoney } from '../../../shared/utils/presentation';
import { FinanceIcon } from '../../../components/ui/FinanceIcon';
const filters = [
  { value: 'all', label: 'Todos' },
  { value: 'income', label: 'Ingresos' },
  { value: 'expense', label: 'Gastos' },
  { value: 'debt-payment', label: 'Pagos' },
];

export function TransactionsPage() {
  const { data, app, family, month, setMonth } = useFinance();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector('a')?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menu]);
  if (!data || !app || !family)
    return (
      <AppShell>
        <p role="status">Cargando movimientos…</p>
      </AppShell>
    );
  const filter = filters.some((item) => item.value === params.get('filter'))
    ? params.get('filter')!
    : 'all';
  const movements = filteredMovementHistory(data, month, filter);
  const dates = [...new Set(movements.map((item) => item.date))];
  const budget = app.calculators.budget.calculate({ ...data, month });
  const currency = data.settings?.currency ?? family.currency;
  const today = localDate();
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = localDate(yesterdayDate);
  return (
    <AppShell>
      <header className="page-header">
        <div className="section-heading">
          <h1>Mis movimientos</h1>
          <button
            type="button"
            className="small-add"
            aria-label="Agregar movimiento"
            aria-expanded={menu}
            aria-controls="movement-actions"
            onClick={() => setMenu(!menu)}
          >
            <Icon name="plus" />
          </button>
        </div>
        <MonthSelector month={month} onChange={setMonth} />
        <div className="movement-totals">
          {[
            { label: 'Ingresos', amount: budget.income, color: 'text-brand' },
            { label: 'Gastos', amount: budget.expenses, color: 'text-expense' },
            { label: 'Disponible', amount: budget.available, color: 'text-saving' },
          ].map((item) => (
            <div key={item.label}>
              <b className={item.color}>{formatMoney(item.amount, currency)}</b>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <Segmented
          label="Filtrar movimientos"
          value={filter}
          options={filters}
          onChange={(value) => setParams(value === 'all' ? {} : { filter: value })}
        />
      </header>
      <main id="main" className="page-content">
        {location.state?.saved && (
          <p role="status" className="success-notice">
            Movimiento guardado correctamente.
          </p>
        )}
        <p className="muted text-xs mb-5">
          Registros del mes. Los ingresos recurrentes se calculan según su frecuencia en el resumen.
        </p>
        {movements.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FinanceIcon name="movements" />}
              action={
                <Link className="text-link" to="/transactions/new">
                  Registrar movimiento →
                </Link>
              }
            >
              {data.transactions.length === 0 &&
              data.incomes.length === 0 &&
              data.expenses.length === 0
                ? 'Todavía no tienes movimientos registrados.'
                : 'No hay movimientos para este mes y filtro.'}
            </EmptyState>
          </Card>
        ) : (
          dates.map((date) => (
            <section className="mb-6" key={date}>
              <h2 className="date-heading">
                {date === today ? 'Hoy' : date === yesterday ? 'Ayer' : formatDate(date)}
              </h2>
              <Card className="movement-card">
                <ul>
                  {movements
                    .filter((item) => item.date === date)
                    .map((item) => {
                      const expense =
                        item.kind === 'expense'
                          ? data.expenses.find((expense) => expense.id === item.relatedEntityId)
                          : undefined;
                      const category =
                        item.details?.categoryName ??
                        (item.kind === 'income'
                          ? 'Ingreso'
                          : item.kind === 'debt-payment'
                            ? 'Deuda'
                            : 'Sin categoría');
                      return (
                        <li key={item.id} className="movement-row">
                          <FinanceIcon
                            {...(item.kind === 'expense'
                              ? {}
                              : {
                                  name:
                                    item.kind === 'income'
                                      ? ('wallet' as const)
                                      : ('debt' as const),
                                })}
                            category={category}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="break-words">{item.description}</p>
                            <small className="muted">
                              {item.kind === 'income'
                                ? 'Ingreso'
                                : item.kind === 'expense'
                                  ? 'Gasto'
                                  : 'Pago'}{' '}
                              · {category}
                              {expense && !expense.paidAt ? ' · Pendiente' : ''}
                            </small>
                            {item.details?.note && (
                              <p className="movement-note">{item.details.note}</p>
                            )}
                          </div>
                          <b className={item.kind === 'income' ? 'text-brand' : ''}>
                            {item.kind === 'income' ? '+' : '-'}
                            {formatMoney(item.amount, currency)}
                          </b>
                        </li>
                      );
                    })}
                </ul>
              </Card>
            </section>
          ))
        )}
      </main>
      {menu && (
        <button
          type="button"
          className="menu-backdrop"
          aria-label="Cerrar acciones"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="floating-actions">
        {menu && (
          <div
            className="floating-menu"
            id="movement-actions"
            ref={menuRef}
            aria-label="Acciones de movimientos"
          >
            <Link to="/transactions/new?kind=income">
              <Icon name="wallet" />
              <span>Nuevo ingreso</span>
            </Link>
            <Link to="/transactions/new?kind=expense">
              <Icon name="cart" />
              <span>Nuevo gasto</span>
            </Link>
            <Link to="/transactions/new?kind=debt-payment">
              <Icon name="debt" />
              <span>Registrar pago</span>
            </Link>
          </div>
        )}
        <button
          type="button"
          className="fab"
          ref={buttonRef}
          aria-label={menu ? 'Cerrar acciones de movimientos' : 'Abrir acciones de movimientos'}
          aria-expanded={menu}
          aria-controls="movement-actions"
          onClick={() => setMenu(!menu)}
        >
          <Icon name={menu ? 'close' : 'plus'} />
        </button>
      </div>
    </AppShell>
  );
}
