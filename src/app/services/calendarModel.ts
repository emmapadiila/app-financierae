import type { WorkspaceData } from './financeWorkspace';
import { localDate } from './financeWorkspace';
import { monthRange } from '../../shared/utils/dates';

export interface CalendarEvent {
  id: string;
  date: string;
  name: string;
  amount: number;
  status: 'paid' | 'upcoming' | 'overdue' | 'income' | 'planned';
  kind: 'expense' | 'income' | 'debt' | 'payment';
  entityId: string;
}
export function calendarEvents(
  data: WorkspaceData,
  month: string,
  today = localDate(),
): CalendarEvent[] {
  const events: CalendarEvent[] = data.expenses
    .filter((e) => e.dueDate.startsWith(month))
    .map((e) => ({
      id: `expense-${e.id}`,
      date: e.dueDate,
      name: e.name,
      amount: e.amount,
      status: e.paidAt ? 'paid' : e.dueDate < today ? 'overdue' : 'upcoming',
      kind: 'expense',
      entityId: e.id,
    }));
  for (const income of data.incomes.filter((i) => i.effectiveDate.startsWith(month)))
    events.push({
      id: `income-${income.id}`,
      date: income.effectiveDate,
      name: income.name,
      amount: income.amount,
      status: 'income',
      kind: 'income',
      entityId: income.id,
    });
  for (const payment of data.debtPayments.filter((p) => p.date.startsWith(month)))
    events.push({
      id: `payment-${payment.id}`,
      date: payment.date,
      name: data.debts.find((d) => d.id === payment.debtId)?.name ?? 'Pago de deuda',
      amount: payment.amount,
      status: 'paid',
      kind: 'payment',
      entityId: payment.debtId,
    });
  // Future due dates are scheduled reminders, never assertions of an unpaid installment.
  const lastDay = Number(monthRange(month).end.slice(8));
  for (const debt of data.debts.filter(
    (d) => d.remainingBalance > 0 && d.dueDay && d.createdAt.slice(0, 7) <= month,
  )) {
    const date = `${month}-${String(Math.min(debt.dueDay!, lastDay)).padStart(2, '0')}`;
    if (date >= today)
      events.push({
        id: `debt-${debt.id}`,
        date,
        name: debt.name,
        amount: Math.min(debt.minimumPayment, debt.remainingBalance),
        status: 'planned',
        kind: 'debt',
        entityId: debt.id,
      });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
