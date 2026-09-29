import Dexie, { type Table } from 'dexie';
import type {
  Debt,
  DebtPayment,
  Expense,
  ExpenseCategory,
  Family,
  FinancialSettings,
  FinancialTransaction,
  Income,
  MonthlyBudget,
  SavingsGoal,
  SavingsTransaction,
} from '../../domain/models/financial';

export class FinanceDatabase extends Dexie {
  families!: Table<Family, string>;
  incomes!: Table<Income, string>;
  expenses!: Table<Expense, string>;
  expenseCategories!: Table<ExpenseCategory, string>;
  debts!: Table<Debt, string>;
  debtPayments!: Table<DebtPayment, string>;
  savingsGoals!: Table<SavingsGoal, string>;
  savingsTransactions!: Table<SavingsTransaction, string>;
  transactions!: Table<FinancialTransaction, string>;
  budgets!: Table<MonthlyBudget, string>;
  settings!: Table<FinancialSettings, string>;

  constructor(name = 'mi-familia-finanzas') {
    super(name);
    this.version(1).stores({
      families: '&id',
      incomes: '&id, familyId, effectiveDate, frequency',
      expenses: '&id, familyId, dueDate, paidAt, kind',
      expenseCategories: '&id, familyId',
      debts: '&id, familyId, dueDay',
      debtPayments: '&id, familyId, debtId, date',
      savingsGoals: '&id, familyId, targetDate',
      savingsTransactions: '&id, familyId, goalId, date',
      transactions: '&id, familyId, kind, date',
      budgets: '&id, familyId, month, [familyId+month]',
      settings: '&id, familyId',
    });
  }
}