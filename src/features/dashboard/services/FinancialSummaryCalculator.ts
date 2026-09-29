import type {
  Debt,
  DebtPayment,
  Expense,
  ExpenseCategory,
  Income,
  SavingsGoal,
  SavingsTransaction,
} from '../../../domain/models/financial';
import { currentMonth } from '../../../shared/utils/dates';
import { calculateMonthlyIncomeTotal } from '../../income/services/IncomeService';

export interface FinancialSummaryInput {
  month: string;
  asOfDate: string;
  incomes: readonly Income[];
  expenses: readonly Expense[];
  expenseCategories: readonly ExpenseCategory[];
  debts: readonly Debt[];
  debtPayments: readonly DebtPayment[];
  savingsGoals: readonly SavingsGoal[];
  savingsTransactions: readonly SavingsTransaction[];
}

export interface UpcomingPayment {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  kind: 'expense' | 'debt';
}

export interface ExpenseDistributionItem {
  categoryId: string | null;
  categoryName: string;
  amount: number;
  percentage: number;
}

export interface DebtProgressSummary {
  originalPrincipal: number;
  remainingBalance: number;
  paidAmount: number;
  percentage: number;
}

export interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  totalDebt: number;
  monthlyDebtPayments: number;
  totalSavings: number;
  availableMoney: number;
  upcomingPayments: UpcomingPayment[];
  expenseDistribution: ExpenseDistributionItem[];
  debtProgress: DebtProgressSummary;
}

function nextMonthlyDueDate(fromDate: string, dueDay: number): string {
  const [yearText, monthText] = fromDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Fecha inválida: ${fromDate}`);
  }
  const monthEnd = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let due = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(dueDay, monthEnd)).padStart(2, '0')}`;
  if (due < fromDate) {
    const nextMonth = new Date(Date.UTC(year, month, 1));
    const nextYear = nextMonth.getUTCFullYear();
    const nextMonthNumber = nextMonth.getUTCMonth() + 1;
    const nextMonthEnd = new Date(Date.UTC(nextYear, nextMonthNumber, 0)).getUTCDate();
    due = `${nextYear}-${String(nextMonthNumber).padStart(2, '0')}-${String(Math.min(dueDay, nextMonthEnd)).padStart(2, '0')}`;
  }
  return due;
}

export class FinancialSummaryCalculator {
  calculate(input: FinancialSummaryInput): FinancialSummary {
    const today = input.asOfDate;
    const todayDate = new Date(`${today}T00:00:00Z`);
    const upcomingEnd = new Date(todayDate.getTime() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const monthExpenses = input.expenses.filter((expense) => expense.dueDate.startsWith(input.month));
    const totalIncome = calculateMonthlyIncomeTotal(input.incomes, input.month);
    const totalExpenses = monthExpenses.reduce((total, expense) => total + expense.amount, 0);
    const monthlyDebtPayments = input.debtPayments
      .filter((payment) => payment.date.startsWith(input.month))
      .reduce((total, payment) => total + payment.amount, 0);
    const savingsThisMonth = input.savingsTransactions
      .filter((transaction) => transaction.date.startsWith(input.month))
      .reduce(
        (total, transaction) =>
          total + (transaction.kind === 'contribution' ? transaction.amount : -transaction.amount),
        0,
      );
    const totalSavings = input.savingsGoals.reduce((total, goal) => total + goal.currentAmount, 0);
    const totalDebt = input.debts.reduce((total, debt) => total + debt.remainingBalance, 0);
    const categories = new Map(input.expenseCategories.map((category) => [category.id, category.name]));
    const distribution = new Map<string, { categoryId: string | null; name: string; amount: number }>();

    for (const expense of monthExpenses) {
      const categoryId = expense.categoryId ?? null;
      const key = categoryId ?? 'uncategorized';
      const current = distribution.get(key) ?? {
        categoryId,
        name: categoryId ? (categories.get(categoryId) ?? 'Sin categoría') : 'Sin categoría',
        amount: 0,
      };
      current.amount += expense.amount;
      distribution.set(key, current);
    }

    const originalPrincipal = input.debts.reduce((total, debt) => total + debt.principal, 0);
    const paidAmount = input.debts.reduce(
      (total, debt) => total + Math.max(0, debt.principal - debt.remainingBalance),
      0,
    );
    const upcomingPayments: UpcomingPayment[] = input.expenses
      .filter(
        (expense) =>
          !expense.paidAt && expense.dueDate >= today && expense.dueDate <= upcomingEnd,
      )
      .map((expense) => ({
        id: expense.id,
        description: expense.name,
        amount: expense.amount,
        dueDate: expense.dueDate,
        kind: 'expense',
      }));

    for (const debt of input.debts) {
      if (!debt.dueDay || debt.minimumPayment === 0 || debt.remainingBalance === 0) continue;
      const dueDate = nextMonthlyDueDate(today, debt.dueDay);
      if (dueDate >= today && dueDate <= upcomingEnd) {
        upcomingPayments.push({
          id: debt.id,
          description: debt.name,
          amount: Math.min(debt.minimumPayment, debt.remainingBalance),
          dueDate,
          kind: 'debt',
        });
      }
    }

    return {
      totalIncome,
      totalExpenses,
      totalDebt,
      monthlyDebtPayments,
      totalSavings,
      availableMoney: totalIncome - totalExpenses - monthlyDebtPayments - savingsThisMonth,
      upcomingPayments: upcomingPayments.sort((left, right) => left.dueDate.localeCompare(right.dueDate)),
      expenseDistribution: [...distribution.values()]
        .map((item) => ({
          categoryId: item.categoryId,
          categoryName: item.name,
          amount: item.amount,
          percentage: totalExpenses === 0 ? 0 : (item.amount / totalExpenses) * 100,
        }))
        .sort((left, right) => right.amount - left.amount),
      debtProgress: {
        originalPrincipal,
        remainingBalance: totalDebt,
        paidAmount,
        percentage:
          originalPrincipal === 0 ? 0 : Math.min(100, (paidAmount / originalPrincipal) * 100),
      },
    };
  }
}

export function currentFinancialMonth(date = new Date()): string {
  return currentMonth(date);
}