import type { FinancialTransaction } from '../../domain/models/financial';
import type { WorkspaceData } from './financeWorkspace';

export function filteredMovementHistory(data: WorkspaceData, month: string, filter = 'all') {
  return movementHistory(data).filter(
    (item) => item.date.startsWith(month) && (filter === 'all' || item.kind === filter),
  );
}

// Read adapter for pre-existing records without ledger entries; never persists or
// feeds financial calculators. Linked ledger entries replace, not duplicate, them.
export function movementHistory(data: WorkspaceData): FinancialTransaction[] {
  const result = [...data.transactions];
  const linked = new Set(result.map((item) => `${item.kind}:${item.relatedEntityId ?? ''}`));
  for (const income of data.incomes) {
    if (!linked.has(`income:${income.id}`))
      result.push({
        ...income,
        kind: 'income',
        description: income.name,
        date: income.effectiveDate,
        relatedEntityId: income.id,
      });
  }
  for (const expense of data.expenses) {
    if (!linked.has(`expense:${expense.id}`))
      result.push({
        ...expense,
        kind: 'expense',
        description: expense.name,
        date: expense.dueDate,
        relatedEntityId: expense.id,
        details: {
          categoryName:
            data.expenseCategories.find((item) => item.id === expense.categoryId)?.name ??
            'Sin categoría',
        },
      });
  }
  for (const payment of data.debtPayments) {
    if (!linked.has(`debt-payment:${payment.id}`))
      result.push({
        ...payment,
        kind: 'debt-payment',
        description: data.debts.find((item) => item.id === payment.debtId)?.name ?? 'Pago de deuda',
        updatedAt: payment.createdAt,
        relatedEntityId: payment.id,
      });
  }
  for (const saving of data.savingsTransactions) {
    const kind = saving.kind === 'contribution' ? 'savings-contribution' : 'savings-withdrawal';
    if (!linked.has(`${kind}:${saving.id}`))
      result.push({
        ...saving,
        kind,
        description: data.savingsGoals.find((goal) => goal.id === saving.goalId)?.name ?? 'Ahorro',
        updatedAt: saving.createdAt,
        relatedEntityId: saving.id,
        details: { categoryName: 'Ahorro', ...(saving.note ? { note: saving.note } : {}) },
      });
  }
  return result.sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
}
