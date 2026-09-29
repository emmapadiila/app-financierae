import type { Table } from 'dexie';
import type { IdentifiedEntity } from '../../domain/models/financial';
import type {
  EntityRepository,
  FinanceRepositories,
  RepositoryName,
  TransactionRunner,
} from '../../domain/ports/financeRepositories';
import { FinanceDatabase } from './FinanceDatabase';

function tableRepository<TEntity extends IdentifiedEntity>(
  table: Table<TEntity, string>,
): EntityRepository<TEntity> {
  return {
    list: () => table.toArray(),
    get: (id) => table.get(id),
    save: async (entity) => {
      await table.put(entity);
    },
    saveMany: async (entities) => {
      await table.bulkPut([...entities]);
    },
    delete: async (id) => {
      await table.delete(id);
    },
    deleteAll: async () => {
      await table.clear();
    },
  };
}

export interface IndexedDbFinanceStore {
  database: FinanceDatabase;
  repositories: FinanceRepositories;
  transactionRunner: TransactionRunner;
}

export function createIndexedDbFinanceStore(
  database = new FinanceDatabase(),
): IndexedDbFinanceStore {
  const repositories: FinanceRepositories = {
    families: tableRepository(database.families),
    incomes: tableRepository(database.incomes),
    expenses: tableRepository(database.expenses),
    expenseCategories: tableRepository(database.expenseCategories),
    debts: tableRepository(database.debts),
    debtPayments: tableRepository(database.debtPayments),
    savingsGoals: tableRepository(database.savingsGoals),
    savingsTransactions: tableRepository(database.savingsTransactions),
    transactions: tableRepository(database.transactions),
    budgets: tableRepository(database.budgets),
    settings: tableRepository(database.settings),
  };

  const transactionRunner: TransactionRunner = {
    run: async <T>(repositoryNames: readonly RepositoryName[], operation: () => Promise<T>) => {
      const tables = [...new Set(repositoryNames)].map((name) => database.table(name));
      if (tables.length === 0) return operation();
      return database.transaction('rw', tables, operation);
    },
  };

  return { database, repositories, transactionRunner };
}