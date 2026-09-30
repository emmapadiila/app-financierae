import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FinanceDatabase } from '../src/infrastructure/storage/FinanceDatabase';
import {
  createFinanceSession,
  type FinanceSession,
  type FinanceSnapshot,
} from '../src/app/services/financeSession';
import { localDate } from '../src/app/services/financeWorkspace';

describe('application boundary without React', () => {
  let database: FinanceDatabase;
  let session: FinanceSession;
  let unsubscribe: (() => void) | undefined;
  beforeEach(() => {
    database = new FinanceDatabase(`session-${crypto.randomUUID()}`);
    session = createFinanceSession(database);
  });
  afterEach(async () => {
    unsubscribe?.();
    session.close();
    await database.delete();
  });

  it('exposes operations and observes committed records without leaking storage handles', async () => {
    const snapshots: FinanceSnapshot[] = [];
    const errors: unknown[] = [];
    unsubscribe = session.subscribe(
      (snapshot) => snapshots.push(snapshot),
      (error) => errors.push(error),
    );
    await expect.poll(() => snapshots.length).toBeGreaterThan(0);
    expect(snapshots[0]?.family).toBeNull();
    const input = { income: 2350000, expenses: [], debts: [], savings: 0 };
    await session.initialize(input);
    await session.recordMovement({
      kind: 'income',
      name: 'Ingreso adicional de prueba',
      amount: 300000,
      date: localDate(),
      category: 'Ingreso',
      expenseKind: 'variable',
      frequency: 'occasional',
      paymentMethod: 'transfer',
      note: '',
      repeatMonthly: false,
    });
    await expect.poll(() => snapshots.at(-1)?.data?.incomes.length).toBe(2);
    const snapshot = snapshots.at(-1)!;
    expect(snapshot.app).not.toHaveProperty('database');
    expect(snapshot.app).not.toHaveProperty('repositories');
    expect(session).not.toHaveProperty('database');
    expect(
      snapshot.app!.calculators.budget.calculate({
        ...snapshot.data!,
        month: localDate().slice(0, 7),
      }).income,
    ).toBe(2650000);
    expect(snapshot.data?.transactions).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  it('rejects operations before a family exists without writing partial records', async () => {
    await expect(
      session.recordMovement({
        kind: 'expense',
        name: 'Gasto de prueba',
        amount: 10,
        date: localDate(),
        category: 'Otros',
        expenseKind: 'variable',
        frequency: 'occasional',
        paymentMethod: 'cash',
        note: '',
        repeatMonthly: false,
      }),
    ).rejects.toThrow('configura tu familia');
    expect(await database.expenses.count()).toBe(0);
    expect(await database.transactions.count()).toBe(0);
  });
});
