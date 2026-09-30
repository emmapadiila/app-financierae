import type { FinanceApplication, WorkspaceData, OnboardingInput } from './financeWorkspace';
import { localDate } from './financeWorkspace';
import { addMonthsToMonth } from '../../shared/utils/dates';
import { calculateExpenseTotals } from '../../features/transactions/services/ExpenseService';

export function selectedExpenseTotal(expenses: OnboardingInput['expenses']) {
  return calculateExpenseTotals(expenses.map((expense, index) => ({
    id: String(index), familyId: '', name: expense.name, amount: expense.amount,
    dueDate: expense.dueDate ?? localDate(), kind: 'fixed' as const, createdAt: '', updatedAt: '',
  }))).total;
}

export function createDashboardModel(data: WorkspaceData, calculators: FinanceApplication['calculators'], month: string, today = localDate()) {
  const asOfDate = month === today.slice(0, 7) ? today : `${month}-01`;
  const summary = calculators.financialSummary.calculate({ ...data, month, asOfDate });
  const budget = calculators.budget.calculate({ ...data, month });
  const previous = calculators.budget.calculate({ ...data, month: addMonthsToMonth(month, -1) });
  const savingsProgress = data.savingsGoals.length ? calculators.savings.calculateProgress({
    targetAmount: data.savingsGoals.reduce((sum, goal) => sum + goal.targetAmount, 0),
    currentAmount: summary.totalSavings,
    monthlyContribution: Math.max(0, budget.savings),
  }) : null;
  const change = (current: number, before: number) => before > 0 ? Math.round((current - before) / before * 100) : null;
  return {
    summary, budget, savingsProgress, asOfDate,
    plannedSavings: data.budgets.find(item => item.month === month)?.plannedSavings ?? 0,
    incomeChange: change(budget.income, previous.income), expenseChange: change(budget.expenses, previous.expenses),
    upcomingPayments: summary.upcomingPayments.map(payment => ({ ...payment, status: payment.dueDate === today ? 'Hoy' : 'Próximo' })),
  };
}
