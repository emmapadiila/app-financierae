import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFinanceBackup, importFinanceBackup, parseFinanceBackup } from '../src/features/backup/services/financeBackup';
import { FinanceDatabase } from '../src/infrastructure/storage/FinanceDatabase';
import { createIndexedDbFinanceStore } from '../src/infrastructure/storage/indexedDbRepositories';
import { ConfirmationRequiredError } from '../src/shared/utils/serviceErrors';
import { familyId, mockDebt, mockFamily, mockIncome, timestamp } from './fixtures/mockFinanceData';

describe('JSON backup', () => {
  let database: FinanceDatabase;
  let store: ReturnType<typeof createIndexedDbFinanceStore>;

  beforeEach(() => {
    database = new FinanceDatabase(`backup-tests-${crypto.randomUUID()}`);
    store = createIndexedDbFinanceStore(database);
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('exports versioned records and round-trips a valid backup', async () => {
    await store.repositories.families.save(mockFamily);
    await store.repositories.incomes.save(mockIncome);
    await store.repositories.debts.save(mockDebt);
    const backup = await createFinanceBackup(store.repositories, timestamp);
    const parsed = parseFinanceBackup(JSON.stringify(backup));

    expect(parsed.version).toBe(1);
    expect(parsed.family?.id).toBe(familyId);
    expect(parsed.incomes).toHaveLength(1);
    expect(parsed.debts).toHaveLength(1);
  });

  it('rejects malformed JSON, unsupported version, invalid amount and broken references', () => {
    expect(() => parseFinanceBackup('{')).toThrow(/JSON válido/);
    expect(() => parseFinanceBackup(JSON.stringify({ version: 2 }))).toThrow();

    const base = {
      version: 1,
      exportedAt: timestamp,
      family: mockFamily,
      incomes: [mockIncome],
      expenses: [],
      expenseCategories: [],
      debts: [mockDebt],
      debtPayments: [],
      savingsGoals: [],
      savingsTransactions: [],
      transactions: [],
      budgets: [],
      settings: null,
    };
    expect(() => parseFinanceBackup(JSON.stringify({ ...base, incomes: [{ ...mockIncome, amount: -5 }] }))).toThrow();
    expect(() =>
      parseFinanceBackup(
        JSON.stringify({
          ...base,
          debtPayments: [
            {
              id: '00000000-0000-4000-8000-000000000031',
              familyId,
              debtId: '00000000-0000-4000-8000-000000000032',
              amount: 1,
              date: '2026-01-01',
              createdAt: timestamp,
            },
          ],
        }),
      ),
    ).toThrow(/deuda inexistente/);
  });

  it('requires explicit confirmation before replacing existing data and then replaces atomically', async () => {
    await store.repositories.families.save(mockFamily);
    await store.repositories.incomes.save(mockIncome);
    const backup = await createFinanceBackup(store.repositories, timestamp);
    const replacement = JSON.stringify({ ...backup, incomes: [] });

    await expect(
      importFinanceBackup(replacement, store.repositories, store.transactionRunner),
    ).rejects.toBeInstanceOf(ConfirmationRequiredError);
    expect(await store.repositories.incomes.list()).toHaveLength(1);

    await importFinanceBackup(replacement, store.repositories, store.transactionRunner, {
      confirmReplace: true,
    });
    expect(await store.repositories.incomes.list()).toHaveLength(0);
    expect(await store.repositories.families.list()).toHaveLength(1);
  });

  it('does not clear current data when the imported file is invalid', async () => {
    await store.repositories.families.save(mockFamily);
    await expect(
      importFinanceBackup('{invalid', store.repositories, store.transactionRunner, {
        confirmReplace: true,
      }),
    ).rejects.toThrow(/JSON válido/);
    expect(await store.repositories.families.list()).toHaveLength(1);
  });
});