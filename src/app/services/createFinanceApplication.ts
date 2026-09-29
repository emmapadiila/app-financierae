import { DebtService } from '../../features/debts/services/DebtService';
import { DebtPlanner } from '../../features/debt-plan/services/DebtPlanner';
import { BudgetCalculator } from '../../features/budget/services/BudgetCalculator';
import { FinancialSummaryCalculator } from '../../features/dashboard/services/FinancialSummaryCalculator';
import { IncomeService } from '../../features/income/services/IncomeService';
import { SavingsCalculator } from '../../features/savings/services/SavingsCalculator';
import { SavingsService } from '../../features/savings/services/SavingsService';
import { DebtSimulator } from '../../features/simulator/services/DebtSimulator';
import { ExpenseService } from '../../features/transactions/services/ExpenseService';
import { FamilyService } from '../../features/settings/services/FamilyService';
import { FinancialSettingsService } from '../../features/settings/services/FinancialSettingsService';
import {
  createFinanceBackup,
  importFinanceBackup,
} from '../../features/backup/services/financeBackup';
import { createIndexedDbFinanceStore } from '../../infrastructure/storage/indexedDbRepositories';
import { FinanceDatabase } from '../../infrastructure/storage/FinanceDatabase';

export function createFinanceApplication(familyId: string, database = new FinanceDatabase()) {
  const store = createIndexedDbFinanceStore(database);

  return {
    database: store.database,
    services: {
      family: new FamilyService(store.repositories.families),
      financialSettings: new FinancialSettingsService(store.repositories.settings, familyId),
      incomes: new IncomeService(store.repositories.incomes, familyId),
      expenses: new ExpenseService(store.repositories.expenses, familyId),
      debts: new DebtService(
        store.repositories.debts,
        store.repositories.debtPayments,
        store.transactionRunner,
        familyId,
      ),
      savings: new SavingsService(
        store.repositories.savingsGoals,
        store.repositories.savingsTransactions,
        store.transactionRunner,
        familyId,
      ),
      exportBackup: () => createFinanceBackup(store.repositories),
      importBackup: (json: string, confirmReplace = false) =>
        importFinanceBackup(json, store.repositories, store.transactionRunner, { confirmReplace }),
    },
    calculators: {
      budget: new BudgetCalculator(),
      debtPlan: new DebtPlanner(),
      debtSimulator: new DebtSimulator(),
      savings: new SavingsCalculator(),
      financialSummary: new FinancialSummaryCalculator(),
    },
    repositories: store.repositories,
  };
}