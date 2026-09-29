import type {
  Debt,
  DebtPayment,
  Expense,
  ExpenseCategory,
  Family,
  FinancialSettings,
  FinancialTransaction,
  IdentifiedEntity,
  Income,
  MonthlyBudget,
  SavingsGoal,
  SavingsTransaction,
} from '../models/financial';

export interface EntityRepository<TEntity extends IdentifiedEntity> {
  list(): Promise<TEntity[]>;
  get(id: string): Promise<TEntity | undefined>;
  save(entity: TEntity): Promise<void>;
  saveMany(entities: readonly TEntity[]): Promise<void>;
  delete(id: string): Promise<void>;
  deleteAll(): Promise<void>;
}

export interface FinanceRepositories {
  families: EntityRepository<Family>;
  incomes: EntityRepository<Income>;
  expenses: EntityRepository<Expense>;
  expenseCategories: EntityRepository<ExpenseCategory>;
  debts: EntityRepository<Debt>;
  debtPayments: EntityRepository<DebtPayment>;
  savingsGoals: EntityRepository<SavingsGoal>;
  savingsTransactions: EntityRepository<SavingsTransaction>;
  transactions: EntityRepository<FinancialTransaction>;
  budgets: EntityRepository<MonthlyBudget>;
  settings: EntityRepository<FinancialSettings>;
}

export type RepositoryName = keyof FinanceRepositories;

export interface TransactionRunner {
  run<T>(repositories: readonly RepositoryName[], operation: () => Promise<T>): Promise<T>;
}