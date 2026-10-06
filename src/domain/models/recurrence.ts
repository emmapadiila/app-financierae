import type { Expense, FinancialTransaction } from './financial';
import { monthRange } from '../../shared/utils/dates';

export type RecurrenceScope = 'single' | 'following' | 'all';

export function recurrenceBase(source: FinancialTransaction, expense: Expense) {
  return (
    source.details?.recurrenceBase ?? {
      startMonth: expense.dueDate.slice(0, 7),
      name: expense.name,
      amount: expense.amount,
      day: Number(expense.dueDate.slice(8)),
    }
  );
}

export function recurrenceValues(source: FinancialTransaction, expense: Expense, month: string) {
  const base = recurrenceBase(source, expense);
  return (
    source.details?.recurrenceChanges?.filter((change) => change.fromMonth <= month).at(-1) ?? base
  );
}

// Clamp within the target month, retaining the intended day in the rule.
export function recurrenceDate(month: string, day: number) {
  return `${month}-${String(Math.min(day, Number(monthRange(month).end.slice(8)))).padStart(2, '0')}`;
}

export function occurrenceMonth(movement: FinancialTransaction, expense: Expense) {
  return movement.details?.recurrenceMonth ?? expense.dueDate.slice(0, 7);
}
