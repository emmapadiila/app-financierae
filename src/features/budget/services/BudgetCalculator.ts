import type {
  DebtPayment,
  Expense,
  Income,
  SavingsTransaction,
} from '../../../domain/models/financial';
import { calculateMonthlyIncomeTotal } from '../../income/services/IncomeService';
import { calculateExpenseTotals } from '../../transactions/services/ExpenseService';

export interface BudgetInput {
  month: string;
  incomes: readonly Income[];
  expenses: readonly Expense[];
  debtPayments: readonly DebtPayment[];
  savingsTransactions: readonly SavingsTransaction[];
}

export interface BudgetResult {
  month: string;
  income: number;
  fixedExpenses: number;
  variableExpenses: number;
  expenses: number;
  debtPayments: number;
  savings: number;
  available: number;
}

export class BudgetCalculator {
  calculate(input: BudgetInput): BudgetResult {
    const monthExpenses = input.expenses.filter((expense) => expense.dueDate.startsWith(input.month));
    const expenseTotals = calculateExpenseTotals(monthExpenses);
    const debtPayments = input.debtPayments
      .filter((payment) => payment.date.startsWith(input.month))
      .reduce((total, payment) => total + payment.amount, 0);
    const savings = input.savingsTransactions
      .filter((transaction) => transaction.date.startsWith(input.month))
      .reduce(
        (total, transaction) =>
          total + (transaction.kind === 'contribution' ? transaction.amount : -transaction.amount),
        0,
      );
    const income = calculateMonthlyIncomeTotal(input.incomes, input.month);

    return {
      month: input.month,
      income,
      fixedExpenses: expenseTotals.fixed,
      variableExpenses: expenseTotals.variable,
      expenses: expenseTotals.total,
      debtPayments,
      savings,
      available: income - expenseTotals.total - debtPayments - savings,
    };
  }
}