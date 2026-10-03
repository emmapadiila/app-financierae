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
import { movementActions } from './movementActions';
import { MonthlyBudgetService } from '../../features/budget/services/MonthlyBudgetService';

export function createFinanceApplication(familyId: string, database = new FinanceDatabase()) {
  const store = createIndexedDbFinanceStore(database);
  const incomes = new IncomeService(store.repositories.incomes, familyId);
  const expenses = new ExpenseService(store.repositories.expenses, familyId);
  const debts = new DebtService(
    store.repositories.debts,
    store.repositories.debtPayments,
    store.transactionRunner,
    familyId,
  );

  return {
    database: store.database,
    services: {
      monthlyBudget: new MonthlyBudgetService(
        store.repositories.budgets,
        store.transactionRunner,
        familyId,
      ),
      movements: movementActions(
        store.repositories,
        store.transactionRunner,
        familyId,
        incomes,
        expenses,
      ),
      family: new FamilyService(store.repositories.families),
      financialSettings: new FinancialSettingsService(store.repositories.settings, familyId),
      incomes,
      expenses,
      debts,
      removeDebt: (id: string) =>
        store.transactionRunner.run(['debts', 'debtPayments', 'transactions'], async () => {
          const payments = await debts.getPaymentHistory(id);
          await debts.delete(id);
          const ids = new Set(payments.map((payment) => payment.id));
          for (const movement of await store.repositories.transactions.list()) {
            if (
              movement.familyId === familyId &&
              movement.kind === 'debt-payment' &&
              movement.relatedEntityId &&
              ids.has(movement.relatedEntityId)
            )
              await store.repositories.transactions.delete(movement.id);
          }
        }),
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
