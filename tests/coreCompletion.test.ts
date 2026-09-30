import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceDatabase } from '../src/infrastructure/storage/FinanceDatabase';
import { createFinanceApplication } from '../src/app/services/createFinanceApplication';
import { createIndexedDbFinanceStore } from '../src/infrastructure/storage/indexedDbRepositories';
import { DebtService } from '../src/features/debts/services/DebtService';
import { SavingsService } from '../src/features/savings/services/SavingsService';
import { DebtPlanner } from '../src/features/debt-plan/services/DebtPlanner';
import { DebtSimulator } from '../src/features/simulator/services/DebtSimulator';
import { BudgetCalculator } from '../src/features/budget/services/BudgetCalculator';
import { FinancialSummaryCalculator } from '../src/features/dashboard/services/FinancialSummaryCalculator';
import { parseFinanceBackup } from '../src/features/backup/services/financeBackup';
import { EntityNotFoundError, InsufficientBalanceError } from '../src/shared/utils/serviceErrors';
import {
  familyId,
  mockFamily,
  mockIncome,
  mockExpense,
  mockDebt,
  mockDebtPayment,
  mockSavingsGoal,
  timestamp,
} from './fixtures/mockFinanceData';

describe('phase 2: services, transactions and persistence', () => {
  let database: FinanceDatabase;
  let app: ReturnType<typeof createFinanceApplication>;
  beforeEach(() => {
    database = new FinanceDatabase(`core-${crypto.randomUUID()}`);
    app = createFinanceApplication(familyId, database);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    database.close();
    await database.delete();
  });

  it('completes expense CRUD and rejects invalid updates without changing the record', async () => {
    const input = {
      name: 'Compra de prueba',
      amount: 45,
      kind: 'variable' as const,
      dueDate: '2026-01-15',
    };
    const expense = await app.services.expenses.create(input);
    expect(await app.services.expenses.list()).toEqual([expense]);
    expect(await app.services.expenses.get(expense.id)).toEqual(expense);
    const updated = await app.services.expenses.update(expense.id, {
      name: 'Compra corregida',
      amount: 60,
      kind: 'fixed',
    });
    expect(updated).toMatchObject({ amount: 60, name: 'Compra corregida', kind: 'fixed' });
    await expect(app.services.expenses.update(expense.id, { amount: -1 })).rejects.toThrow();
    expect(await app.services.expenses.get(expense.id)).toEqual(updated);
    await expect(app.services.expenses.create({ ...input, amount: 0 })).rejects.toThrow();
    await app.services.expenses.delete(expense.id);
    expect(await app.services.expenses.list()).toEqual([]);
    await expect(app.services.expenses.get(expense.id)).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('rejects invalid income amounts on valid create inputs and retains unchanged data', async () => {
    const input = {
      name: 'Ingreso de prueba',
      amount: 80,
      frequency: 'monthly' as const,
      effectiveDate: '2026-01-01',
      isActive: true,
    };
    for (const amount of [-1, 0, NaN, Infinity])
      await expect(app.services.incomes.create({ ...input, amount })).rejects.toThrow();
    const income = await app.services.incomes.create(input);
    await expect(app.services.incomes.update(income.id, { amount: -1 })).rejects.toThrow();
    expect(await app.services.incomes.get(income.id)).toEqual(income);
  });

  it('isolates income, expense, debt and savings CRUD between families', async () => {
    await app.repositories.incomes.save(mockIncome);
    await app.repositories.expenses.save(mockExpense);
    await app.repositories.debts.save(mockDebt);
    await app.repositories.savingsGoals.save(mockSavingsGoal);
    const other = createFinanceApplication(crypto.randomUUID(), database);
    expect(await other.services.incomes.list()).toEqual([]);
    expect(await other.services.expenses.list()).toEqual([]);
    expect(await other.services.debts.list()).toEqual([]);
    expect(await other.services.savings.listGoals()).toEqual([]);
    await expect(other.services.incomes.update(mockIncome.id, { amount: 1 })).rejects.toThrow();
    await expect(other.services.expenses.delete(mockExpense.id)).rejects.toThrow();
    await expect(
      other.services.debts.registerPayment(mockDebt.id, { amount: 1, date: '2026-01-01' }),
    ).rejects.toThrow();
    await expect(
      other.services.savings.withdraw(mockSavingsGoal.id, { amount: 1, date: '2026-01-01' }),
    ).rejects.toThrow();
  });

  it('applies simultaneous debt payments without losing balance updates or producing negative balances', async () => {
    await app.repositories.debts.save({ ...mockDebt, principal: 100, remainingBalance: 100 });
    await Promise.all(
      [30, 40].map((amount) =>
        app.services.debts.registerPayment(mockDebt.id, { amount, date: '2026-01-10' }),
      ),
    );
    expect((await app.services.debts.get(mockDebt.id)).remainingBalance).toBe(30);
    await app.services.debts.registerPayment(mockDebt.id, { amount: 50, date: '2026-01-11' });
    expect((await app.services.debts.get(mockDebt.id)).remainingBalance).toBe(0);
    expect(await app.services.debts.getPaymentHistory(mockDebt.id)).toHaveLength(3);
    await expect(
      app.services.debts.update(mockDebt.id, { remainingBalance: -1 }),
    ).rejects.toThrow();
    await expect(
      app.services.debts.registerPayment(mockDebt.id, { amount: 1, date: '2026-01-12' }),
    ).rejects.toThrow();
    await app.services.debts.delete(mockDebt.id);
    expect(await app.repositories.debtPayments.list()).toEqual([]);
  });

  it('rolls back payment history when saving a debt balance fails', async () => {
    const store = createIndexedDbFinanceStore(database);
    await store.repositories.debts.save(mockDebt);
    const service = new DebtService(
      store.repositories.debts,
      store.repositories.debtPayments,
      store.transactionRunner,
      familyId,
    );
    vi.spyOn(store.repositories.debts, 'save').mockRejectedValueOnce(new Error('disk failure'));
    await expect(
      service.registerPayment(mockDebt.id, { amount: 50, date: '2026-01-10' }),
    ).rejects.toThrow('disk failure');
    expect(await store.repositories.debtPayments.list()).toEqual([]);
    expect(await store.repositories.debts.get(mockDebt.id)).toEqual(mockDebt);
  });

  it('completes savings goal CRUD, contributions and withdrawals, and removes linked history', async () => {
    const goal = await app.services.savings.createGoal({
      name: 'Meta de prueba',
      targetAmount: 500,
    });
    expect(await app.services.savings.listGoals()).toEqual([goal]);
    expect(
      (await app.services.savings.updateGoal(goal.id, { targetAmount: 600 })).targetAmount,
    ).toBe(600);
    await app.services.savings.contribute(goal.id, { amount: 250, date: '2026-01-10' });
    expect(
      (await app.services.savings.withdraw(goal.id, { amount: 150, date: '2026-01-11' }))
        .currentAmount,
    ).toBe(100);
    await expect(
      app.services.savings.withdraw(goal.id, { amount: 101, date: '2026-01-12' }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
    expect(
      (await app.services.savings.withdraw(goal.id, { amount: 100, date: '2026-01-12' }))
        .currentAmount,
    ).toBe(0);
    expect(await app.services.savings.getHistory(goal.id)).toHaveLength(3);
    await app.services.savings.deleteGoal(goal.id);
    expect(await app.services.savings.listGoals()).toEqual([]);
    expect(await app.repositories.savingsTransactions.list()).toEqual([]);
  });

  it('serializes competing savings withdrawals to prevent overdrafts', async () => {
    const goal = await app.services.savings.createGoal({ name: 'Meta', targetAmount: 100 });
    await app.services.savings.contribute(goal.id, { amount: 100, date: '2026-01-01' });
    const results = await Promise.allSettled(
      [70, 70].map((amount) =>
        app.services.savings.withdraw(goal.id, { amount, date: '2026-01-02' }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await app.services.savings.getGoal(goal.id)).currentAmount).toBe(30);
    expect(await app.services.savings.getHistory(goal.id)).toHaveLength(2);
  });

  it('rolls back a savings contribution when saving the updated goal fails', async () => {
    const store = createIndexedDbFinanceStore(database);
    await store.repositories.savingsGoals.save(mockSavingsGoal);
    const service = new SavingsService(
      store.repositories.savingsGoals,
      store.repositories.savingsTransactions,
      store.transactionRunner,
      familyId,
    );
    vi.spyOn(store.repositories.savingsGoals, 'save').mockRejectedValueOnce(
      new Error('disk failure'),
    );
    await expect(
      service.contribute(mockSavingsGoal.id, { amount: 5, date: '2026-01-10' }),
    ).rejects.toThrow('disk failure');
    expect(await store.repositories.savingsTransactions.list()).toEqual([]);
    expect(await store.repositories.savingsGoals.get(mockSavingsGoal.id)).toEqual(mockSavingsGoal);
  });

  async function fullBackup() {
    const base = { familyId, createdAt: timestamp, updatedAt: timestamp };
    const categoryId = crypto.randomUUID();
    await app.repositories.families.save(mockFamily);
    await app.repositories.incomes.save(mockIncome);
    await app.repositories.expenseCategories.save({
      ...base,
      id: categoryId,
      name: 'Categoría de prueba',
    });
    await app.repositories.expenses.save({ ...mockExpense, categoryId });
    await app.repositories.debts.save({
      ...mockDebt,
      remainingBalance: mockDebt.principal - mockDebtPayment.amount,
    });
    await app.repositories.debtPayments.save(mockDebtPayment);
    await app.repositories.savingsGoals.save(mockSavingsGoal);
    await app.repositories.savingsTransactions.save({
      familyId,
      createdAt: timestamp,
      id: crypto.randomUUID(),
      goalId: mockSavingsGoal.id,
      amount: mockSavingsGoal.currentAmount,
      date: '2026-01-01',
      kind: 'contribution',
    });
    await app.repositories.transactions.save({
      ...base,
      id: crypto.randomUUID(),
      kind: 'expense',
      description: 'Registro de prueba',
      amount: mockExpense.amount,
      date: mockExpense.dueDate,
      relatedEntityId: mockExpense.id,
    });
    await app.repositories.budgets.save({
      ...base,
      id: crypto.randomUUID(),
      month: '2026-01',
      plannedIncome: 500,
      plannedFixedExpenses: 100,
      plannedVariableExpenses: 50,
      plannedDebtPayments: 25,
      plannedSavings: 10,
    });
    await app.services.financialSettings.update({
      currency: 'COP',
      locale: 'es-CO',
      weekStartsOn: 1,
    });
    return app.services.exportBackup();
  }

  it('exports and restores every table exactly, then persists through a new database connection', async () => {
    const backup = await fullBackup();
    const json = JSON.stringify(backup);
    expect(parseFinanceBackup(json)).toEqual(backup);
    for (const repo of Object.values(app.repositories)) await repo.deleteAll();
    await app.services.importBackup(json);
    database.close();
    database = new FinanceDatabase(database.name);
    app = createFinanceApplication(familyId, database);
    const restored = await app.services.exportBackup();
    expect({ ...restored, exportedAt: backup.exportedAt }).toEqual(backup);
    for (const repo of Object.values(app.repositories)) expect(await repo.list()).toHaveLength(1);
    const nextIncome = await app.services.incomes.update(mockIncome.id, { amount: 321 });
    expect(nextIncome.amount).toBe(321);
  });

  it('rolls back the entire restore when a repository write fails after clearing tables', async () => {
    const original = await fullBackup();
    const replacement = { ...original, incomes: [{ ...mockIncome, amount: 777 }] };
    vi.spyOn(app.repositories.expenses, 'saveMany').mockRejectedValueOnce(
      new Error('restore failure'),
    );
    await expect(app.services.importBackup(JSON.stringify(replacement), true)).rejects.toThrow(
      'restore failure',
    );
    expect({ ...(await app.services.exportBackup()), exportedAt: original.exportedAt }).toEqual(
      original,
    );
  });

  it('rejects duplicate IDs, cross-family records and dangling savings/category references without clearing data', async () => {
    const original = await fullBackup();
    const invalid = [
      { ...original, incomes: [mockIncome, mockIncome] },
      { ...original, incomes: [{ ...mockIncome, familyId: crypto.randomUUID() }] },
      { ...original, savingsGoals: [] },
      { ...original, expenseCategories: [] },
    ];
    for (const backup of invalid) {
      await expect(app.services.importBackup(JSON.stringify(backup), true)).rejects.toThrow();
      expect({ ...(await app.services.exportBackup()), exportedAt: original.exportedAt }).toEqual(
        original,
      );
    }
  });
});

describe('phase 2: calculation boundary cases', () => {
  const debt = {
    ...mockDebt,
    principal: 1000,
    remainingBalance: 1000,
    minimumPayment: 100,
    annualInterestRate: 12,
  };
  it('keeps budget and summary consistent while excluding other months and inactive income', () => {
    const category = {
      id: crypto.randomUUID(),
      familyId,
      name: 'Prueba',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const input = {
      month: '2026-01',
      asOfDate: '2026-01-01',
      incomes: [
        { ...mockIncome, amount: 1000 },
        { ...mockIncome, id: crypto.randomUUID(), amount: 500, isActive: false },
      ],
      expenses: [
        { ...mockExpense, amount: 200, categoryId: category.id },
        { ...mockExpense, id: crypto.randomUUID(), kind: 'variable' as const, amount: 100 },
        { ...mockExpense, id: crypto.randomUUID(), dueDate: '2026-02-10', amount: 900 },
      ],
      debtPayments: [
        { ...mockDebtPayment, amount: 150 },
        { ...mockDebtPayment, id: crypto.randomUUID(), date: '2026-02-01', amount: 800 },
      ],
      savingsTransactions: [
        {
          id: crypto.randomUUID(),
          familyId,
          goalId: mockSavingsGoal.id,
          createdAt: timestamp,
          date: '2026-01-01',
          kind: 'contribution' as const,
          amount: 90,
        },
        {
          id: crypto.randomUUID(),
          familyId,
          goalId: mockSavingsGoal.id,
          createdAt: timestamp,
          date: '2026-01-02',
          kind: 'withdrawal' as const,
          amount: 10,
        },
        {
          id: crypto.randomUUID(),
          familyId,
          goalId: mockSavingsGoal.id,
          createdAt: timestamp,
          date: '2026-02-02',
          kind: 'contribution' as const,
          amount: 900,
        },
      ],
      debts: [{ ...mockDebt, principal: 1000, remainingBalance: 500 }],
      expenseCategories: [category],
      savingsGoals: [{ ...mockSavingsGoal, currentAmount: 80 }],
    };
    const before = structuredClone(input);
    const budget = new BudgetCalculator().calculate(input);
    const summary = new FinancialSummaryCalculator().calculate(input);
    expect(budget).toMatchObject({
      income: 1000,
      fixedExpenses: 200,
      variableExpenses: 100,
      expenses: 300,
      debtPayments: 150,
      savings: 80,
      available: 470,
    });
    expect(summary).toMatchObject({
      totalIncome: 1000,
      totalExpenses: 300,
      monthlyDebtPayments: 150,
      availableMoney: 470,
      totalSavings: 80,
      debtProgress: { paidAmount: 500, percentage: 50 },
    });
    expect(summary.expenseDistribution[0]?.categoryName).toBe('Prueba');
    expect(summary.expenseDistribution[0]?.percentage).toBeCloseTo((200 / 300) * 100);
    expect(summary.expenseDistribution.reduce((sum, item) => sum + item.percentage, 0)).toBeCloseTo(
      100,
    );
    expect(input).toEqual(before);
  });
  it('clamps upcoming debt due dates to leap-month end and excludes paid expenses', () => {
    const input = {
      month: '2028-02',
      asOfDate: '2028-02-20',
      incomes: [],
      expenses: [{ ...mockExpense, dueDate: '2028-02-25', paidAt: timestamp }],
      expenseCategories: [],
      debts: [{ ...debt, dueDay: 31 }],
      debtPayments: [],
      savingsGoals: [],
      savingsTransactions: [],
    };
    const result = new FinancialSummaryCalculator().calculate(input);
    expect(result.upcomingPayments).toHaveLength(1);
    expect(result.upcomingPayments[0]?.dueDate).toBe('2028-02-29');
  });
  it.each(['snowball', 'avalanche', 'custom'] as const)(
    'conserves principal plus interest and never pays below zero with %s',
    (strategy) => {
      const debts = [
        debt,
        {
          ...debt,
          id: crypto.randomUUID(),
          remainingBalance: 400,
          annualInterestRate: 24,
          minimumPayment: 25,
        },
      ];
      const plan = new DebtPlanner().calculate({
        debts,
        strategy,
        customOrder: debts.map((item) => item.id).reverse(),
        extraMonthlyPayment: 75,
        startMonth: '2026-01',
      });
      const totalPaid = plan.monthlyProjection.reduce(
        (total, month) => total + month.totalPayment,
        0,
      );
      expect(totalPaid).toBeCloseTo(1400 + plan.totalInterest, 2);
      expect(plan.monthlyProjection.at(-1)?.remainingDebt).toBe(0);
      for (const month of plan.monthlyProjection) {
        expect(month.totalPayment).toBeLessThanOrEqual(200);
        for (const payment of month.payments) {
          expect(payment.remainingBalance).toBeGreaterThanOrEqual(0);
          expect(payment.startingBalance + payment.interest - payment.payment).toBeCloseTo(
            payment.remainingBalance,
            2,
          );
        }
      }
    },
  );
  it('rejects duplicate debt identifiers before constructing a plan', () => {
    expect(() =>
      new DebtPlanner().calculate({
        debts: [debt, debt],
        strategy: 'snowball',
        extraMonthlyPayment: 0,
        startMonth: '2026-01',
      }),
    ).toThrow();
  });
  it('accepts a complete custom order containing settled debts and ignores their payments', () => {
    const paid = { ...debt, id: crypto.randomUUID(), remainingBalance: 0 };
    const result = new DebtPlanner().calculate({
      debts: [debt, paid],
      strategy: 'custom',
      customOrder: [paid.id, debt.id],
      extraMonthlyPayment: 0,
      startMonth: '2026-01',
    });
    expect(result.monthlyProjection[0]?.payments).toHaveLength(1);
    expect(result.monthlyProjection[0]?.payments[0]?.debtId).toBe(debt.id);
  });
  it('does not fabricate available income by reducing expenses below zero', () => {
    expect(() =>
      new DebtSimulator().simulate({
        debts: [debt],
        monthlyIncome: 500,
        monthlyExpenses: 200,
        currentExtraDebtPayment: 0,
        changes: { incomeIncrease: 0, expenseReduction: 201, debtPaymentIncrease: 0 },
        strategy: 'snowball',
        startMonth: '2026-01',
      }),
    ).toThrow();
  });
  it('does not reserve minimum payments for already-settled debts in simulations', () => {
    const result = new DebtSimulator().simulate({
      debts: [
        { ...debt, annualInterestRate: 0 },
        { ...debt, id: crypto.randomUUID(), remainingBalance: 0, minimumPayment: 1000 },
      ],
      monthlyIncome: 500,
      monthlyExpenses: 200,
      currentExtraDebtPayment: 0,
      changes: { incomeIncrease: 0, expenseReduction: 0, debtPaymentIncrease: 200 },
      strategy: 'snowball',
      startMonth: '2026-01',
    });
    expect(result.simulated.extraDebtPayment).toBe(200);
    expect(result.simulated.estimatedMonths).toBe(4);
  });
});
