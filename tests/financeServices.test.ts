import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FinanceDatabase } from '../src/infrastructure/storage/FinanceDatabase';
import { createIndexedDbFinanceStore } from '../src/infrastructure/storage/indexedDbRepositories';
import { DebtService } from '../src/features/debts/services/DebtService';
import { ExpenseService } from '../src/features/transactions/services/ExpenseService';
import { IncomeService } from '../src/features/income/services/IncomeService';
import { SavingsService } from '../src/features/savings/services/SavingsService';
import { debtSchema, incomeSchema } from '../src/domain/models/financial';
import { EntityNotFoundError, InsufficientBalanceError } from '../src/shared/utils/serviceErrors';
import {
  debtId,
  familyId,
  mockDebt,
  mockExpense,
  mockIncome,
  mockSavingsGoal,
  savingsGoalId,
  timestamp,
} from './fixtures/mockFinanceData';

describe('financial services', () => {
  let database: FinanceDatabase;
  let store: ReturnType<typeof createIndexedDbFinanceStore>;
  let counter: number;

  beforeEach(() => {
    counter = 20;
    database = new FinanceDatabase(`tests-${crypto.randomUUID()}`);
    store = createIndexedDbFinanceStore(database);
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('creates, lists, updates and deletes income; rejects invalid monetary data', async () => {
    const service = new IncomeService(store.repositories.incomes, familyId, {
      idFactory: () => `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`,
      now: () => timestamp,
    });
    const created = await service.create({
      name: 'Pago quincenal',
      amount: 500_000,
      frequency: 'biweekly',
      effectiveDate: '2026-01-01',
      isActive: true,
    });

    expect(await service.list()).toEqual([created]);
    expect((await service.update(created.id, { amount: 600_000 })).amount).toBe(600_000);
    await expect(service.create({ ...created, amount: -1 })).rejects.toThrow();
    await service.delete(created.id);
    await expect(service.get(created.id)).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('rejects invalid income date ranges on creation and partial updates without saving', async () => {
    const service = new IncomeService(store.repositories.incomes, familyId);
    const input = {
      name: 'Ingreso mensual',
      amount: 500_000,
      frequency: 'monthly' as const,
      effectiveDate: '2026-01-10',
      endDate: '2026-01-20',
      isActive: true,
    };

    await expect(service.create({ ...input, endDate: '2026-01-09' })).rejects.toThrow();
    expect(await service.list()).toEqual([]);

    const created = await service.create(input);
    await expect(service.update(created.id, { endDate: '2026-01-09' })).rejects.toThrow();
    await expect(service.update(created.id, { effectiveDate: '2026-01-21' })).rejects.toThrow();
    expect(await service.get(created.id)).toEqual(created);
    expect((await service.update(created.id, { endDate: '2026-01-10' })).endDate).toBe(
      '2026-01-10',
    );
  });

  it('filters expenses by month, pending and overdue status, and marks expenses paid', async () => {
    await store.repositories.expenses.save(mockExpense);
    await store.repositories.expenses.save({
      ...mockExpense,
      id: '00000000-0000-4000-8000-000000000021',
      dueDate: '2025-12-01',
    });
    const service = new ExpenseService(store.repositories.expenses, familyId, {
      now: () => timestamp,
    });

    expect(await service.getForMonth('2026-01')).toHaveLength(1);
    expect(await service.getPending('2026-01-01')).toHaveLength(1);
    expect(await service.getOverdue('2026-01-01')).toHaveLength(1);
    await service.markAsPaid(mockExpense.id);
    expect(await service.getPending('2026-01-01')).toHaveLength(0);
  });

  it('records debt payment history and clamps an overpayment to zero atomically', async () => {
    await store.repositories.debts.save({ ...mockDebt, remainingBalance: 500 });
    const service = new DebtService(
      store.repositories.debts,
      store.repositories.debtPayments,
      store.transactionRunner,
      familyId,
      {
        idFactory: () => `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`,
        now: () => timestamp,
      },
    );

    const result = await service.registerPayment(debtId, { amount: 700, date: '2026-01-15' });
    expect(result.debt.remainingBalance).toBe(0);
    expect(result.isPaid).toBe(true);
    expect(await service.getPaymentHistory(debtId)).toHaveLength(1);
    await expect(
      service.registerPayment(debtId, { amount: 1, date: '2026-01-16' }),
    ).rejects.toThrow();
  });

  it('updates savings balance with contributions and rejects excess withdrawals without writing history', async () => {
    await store.repositories.savingsGoals.save(mockSavingsGoal);
    const service = new SavingsService(
      store.repositories.savingsGoals,
      store.repositories.savingsTransactions,
      store.transactionRunner,
      familyId,
      {
        idFactory: () => `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`,
        now: () => timestamp,
      },
    );
    await service.contribute(savingsGoalId, { amount: 50, date: '2026-01-10' });
    expect((await service.getGoal(savingsGoalId)).currentAmount).toBe(200_050);
    await expect(
      service.withdraw(savingsGoalId, { amount: 300_000, date: '2026-01-11' }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
    expect(await service.getHistory(savingsGoalId)).toHaveLength(1);
  });

  it('validates UUIDs and rejects a debt with a negative remaining balance', () => {
    expect(() => incomeSchema.parse({ ...mockIncome, id: 'not-a-uuid' })).toThrow();
    expect(() => debtSchema.parse({ ...mockDebt, remainingBalance: -1 })).toThrow();
  });
});
