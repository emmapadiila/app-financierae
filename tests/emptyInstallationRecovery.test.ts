import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FinanceDatabase } from '../src/infrastructure/storage/FinanceDatabase';
import {
  createFinanceSession,
  type FinanceSession,
  type FinanceSnapshot,
} from '../src/app/services/financeSession';
import { createIndexedDbFinanceStore } from '../src/infrastructure/storage/indexedDbRepositories';
import { createFinanceBackup } from '../src/features/backup/services/financeBackup';
import { createFinanceApplication } from '../src/app/services/createFinanceApplication';
import { recoveryBackup } from './fixtures/recoveryBackup';

describe('Phase 4.1: restoration without a household', () => {
  let database: FinanceDatabase;
  let session: FinanceSession;
  let unsubscribe: (() => void) | undefined;
  const backup = recoveryBackup();
  const json = JSON.stringify(backup);
  beforeEach(() => {
    database = new FinanceDatabase(`recovery-${crypto.randomUUID()}`);
    session = createFinanceSession(database);
  });
  afterEach(async () => {
    unsubscribe?.();
    unsubscribe = undefined;
    session.close();
    await database.delete();
  });
  const readBackup = () =>
    createFinanceBackup(createIndexedDbFinanceStore(database).repositories, backup.exportedAt);
  async function expectEmpty() {
    expect(await Promise.all(database.tables.map((table) => table.count()))).toEqual(
      Array(11).fill(0),
    );
  }
  it('restores every collection exactly into a completely empty installation without onboarding', async () => {
    await expectEmpty();
    await session.importBackup(json, true);
    expect(await readBackup()).toEqual(backup);
  });
  it.each([
    ['family'],
    ['incomes'],
    ['expenses', 'expenseCategories'],
    ['debts', 'debtPayments'],
    ['savingsGoals', 'savingsTransactions'],
    ['transactions'],
    ['budgets', 'settings'],
  ] as const)('restores collection group %s with original IDs and values', async (...keys) => {
    await session.importBackup(json, true);
    const restored = await readBackup();
    for (const key of keys) expect(restored[key]).toEqual(backup[key]);
  });
  it.each([
    ['non-JSON', 'not a JSON file'],
    ['truncated JSON', '{"version":1,'],
    ['incompatible version', JSON.stringify({ ...backup, version: 2 })],
    [
      'invalid schema',
      JSON.stringify({ ...backup, incomes: [{ ...backup.incomes[0], amount: -1 }] }),
    ],
    ['invalid reference', JSON.stringify({ ...backup, debts: [] })],
  ])('rejects %s without writing any collection', async (_name, invalid) => {
    await expect(session.importBackup(invalid, true)).rejects.toThrow();
    await expectEmpty();
  });
  it('publishes the restored family and complete workspace through the existing subscription', async () => {
    const snapshots: FinanceSnapshot[] = [];
    const errors: unknown[] = [];
    unsubscribe = session.subscribe(
      (value) => snapshots.push(value),
      (error) => errors.push(error),
    );
    await expect.poll(() => snapshots.length).toBeGreaterThan(0);
    expect(snapshots.at(-1)?.family).toBeNull();
    await session.importBackup(json, true);
    await expect.poll(() => snapshots.at(-1)?.family?.id).toBe(backup.family!.id);
    const restored = snapshots.at(-1)!;
    expect(restored.data?.incomes).toEqual(backup.incomes);
    expect(restored.data?.settings).toEqual(backup.settings);
    expect(
      restored.app?.calculators.budget.calculate({ ...restored.data!, month: '2026-01' }).available,
    ).toBe(850000);
    expect(errors).toEqual([]);
  });
  it('retains all collections after closing the connection and starting a new session', async () => {
    await session.importBackup(json, true);
    session.close();
    database = new FinanceDatabase(database.name);
    session = createFinanceSession(database);
    const snapshots: FinanceSnapshot[] = [];
    unsubscribe = session.subscribe(
      (value) => snapshots.push(value),
      () => {},
    );
    await expect.poll(() => snapshots.at(-1)?.family?.id).toBe(backup.family!.id);
    expect(await readBackup()).toEqual(backup);
  });
  it.each([false, true])(
    'rolls back actual IndexedDB writes after a mid-restore failure (existing=%s)',
    async (existing) => {
      if (existing) await session.initialize({ income: 100, expenses: [], debts: [], savings: 0 });
      const before = await readBackup();
      // Inject a storage failure, while keeping the actual IndexedDB transaction and writes.
      database.budgets.hook('creating', () => {
        throw new Error('Storage write failed');
      });
      await expect(session.importBackup(json, true)).rejects.toThrow('Storage write failed');
      expect(await readBackup()).toEqual(before);
    },
  );
  it('preserves existing data on validation failure and requires replacement confirmation', async () => {
    await session.initialize({ income: 100, expenses: [], debts: [], savings: 0 });
    const before = await readBackup();
    await expect(session.importBackup('{invalid', true)).rejects.toThrow();
    await expect(session.importBackup(json)).rejects.toThrow();
    expect(await readBackup()).toEqual(before);
    await session.importBackup(json, true);
    expect(await readBackup()).toEqual(backup);
  });
  it('keeps the existing application export/import service compatible', async () => {
    const family = await session.initialize({ income: 100, expenses: [], debts: [], savings: 0 });
    const app = createFinanceApplication(family.id, database);
    const exported = await app.services.exportBackup();
    await session.importBackup(json, true);
    await app.services.importBackup(JSON.stringify(exported), true);
    expect((await app.services.exportBackup()).family).toEqual(exported.family);
    expect((await app.services.exportBackup()).incomes).toEqual(exported.incomes);
  });
});
