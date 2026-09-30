import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceDatabase } from '../src/infrastructure/storage/FinanceDatabase';
import { completeOnboarding, findFamily, loadWorkspace, type OnboardingInput } from '../src/app/services/financeWorkspace';
import { createFinanceApplication } from '../src/app/services/createFinanceApplication';
import { createDashboardModel, selectedExpenseTotal } from '../src/app/services/dashboardModel';
import { DebtService } from '../src/features/debts/services/DebtService';
import { displayCurrencyInput, parseCurrencyInput } from '../src/shared/utils/currencyInput';
import { formatMoney } from '../src/shared/utils/presentation';

describe('block A: onboarding to persisted dashboard', () => {
  let database: FinanceDatabase;
  const input: OnboardingInput = {
    income: 2370000,
    expenses: [
      { name: 'Energía', category: 'Servicios', amount: 123000, dueDate: '2026-09-30' },
      { name: 'Internet', category: 'Servicios', amount: 87000, dueDate: '2026-09-30' },
      { name: 'Alimentación', category: 'Alimentación', amount: 410000, dueDate: '2026-09-30' },
    ],
    debts: [{ name: 'Deuda de prueba', creditor: 'Acreedor de prueba', principal: 800000, remainingBalance: 640000, minimumPayment: 80000, annualInterestRate: 18, dueDay: 15 }],
    savings: 190000, savingsAlreadySetAside: true,
  };
  beforeEach(() => { database = new FinanceDatabase(`onboarding-${crypto.randomUUID()}`); });
  afterEach(async () => { vi.restoreAllMocks(); database.close(); await database.delete(); });

  it('persists actual amounts, savings confirmation, due dates and debt progress', async () => {
    const family = await completeOnboarding(database, input, '2026-09-30');
    const app = createFinanceApplication(family.id, database);
    const data = await loadWorkspace(app, family.id);
    const model = createDashboardModel(data, app.calculators, '2026-09', '2026-09-30');
    expect(model.budget).toMatchObject({ income: 2370000, expenses: 620000, savings: 190000, available: 1560000, debtPayments: 0 });
    expect(model.summary.totalDebt).toBe(640000);
    expect(model.summary.totalSavings).toBe(190000);
    expect(model.summary.debtProgress.percentage).toBe(20);
    expect(model.upcomingPayments).toHaveLength(4);
    expect(model.summary.expenseDistribution.find(item => item.categoryName === 'Servicios')?.percentage).toBeCloseTo(210000 / 620000 * 100);
    expect(data.expenses.map(item => item.dueDate)).toEqual(['2026-09-30', '2026-09-30', '2026-09-30']);
    expect(data.savingsTransactions).toHaveLength(1);
    expect(data.budgets[0]?.plannedSavings).toBe(190000);
    expect(data.debtPayments).toEqual([]);
  });

  it('stores a savings goal without inventing a contribution when not confirmed', async () => {
    const family = await completeOnboarding(database, { ...input, savingsAlreadySetAside: false }, '2026-09-30');
    const app = createFinanceApplication(family.id, database);
    const data = await loadWorkspace(app, family.id);
    const model = createDashboardModel(data, app.calculators, '2026-09', '2026-09-30');
    expect(model.plannedSavings).toBe(190000);
    expect(model.summary.totalSavings).toBe(0);
    expect(model.budget.available).toBe(1750000);
    expect(data.savingsGoals[0]).toMatchObject({ targetAmount: 190000, currentAmount: 0 });
    expect(data.savingsTransactions).toEqual([]);
  });

  it('supports an empty household without seeding sample financial data', async () => {
    const family = await completeOnboarding(database, { income: 0, expenses: [], debts: [], savings: 0 }, '2026-09-30');
    const app = createFinanceApplication(family.id, database);
    const data = await loadWorkspace(app, family.id);
    const model = createDashboardModel(data, app.calculators, '2026-09', '2026-09-30');
    expect([data.incomes, data.expenses, data.debts, data.savingsGoals, data.savingsTransactions, data.transactions]).toEqual([[], [], [], [], [], []]);
    expect(model.budget.available).toBe(0);
    expect(model.summary.expenseDistribution).toEqual([]);
    expect(model.savingsProgress).toBeNull();
    expect(await findFamily(database)).toEqual(family);
  });

  it('rolls back the complete setup on service failure and permits a clean retry', async () => {
    const failure = vi.spyOn(DebtService.prototype, 'create').mockRejectedValueOnce(new Error('write failed'));
    await expect(completeOnboarding(database, input, '2026-09-30')).rejects.toThrow('write failed');
    for (const table of database.tables) expect(await table.count()).toBe(0);
    failure.mockRestore();
    await completeOnboarding(database, input, '2026-09-30');
    expect(await database.families.count()).toBe(1);
    expect(await database.incomes.count()).toBe(1);
  });

  it('rejects invalid input before creating a family', async () => {
    await expect(completeOnboarding(database, { ...input, expenses: [{ name: ' ', category: 'Servicios', amount: -5 }] })).rejects.toThrow();
    expect(await findFamily(database)).toBeNull();
    expect(await database.budgets.count()).toBe(0);
  });

  it('does not duplicate onboarding data on a concurrent repeated submission', async () => {
    const results = await Promise.allSettled([completeOnboarding(database, input, '2026-09-30'), completeOnboarding(database, input, '2026-09-30')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await database.families.count()).toBe(1);
    expect(await database.incomes.count()).toBe(1);
    expect(await database.savingsTransactions.count()).toBe(1);
  });

  it('reopens existing setup and derives updated totals from services without copying financial rules', async () => {
    const family = await completeOnboarding(database, input, '2026-09-30');
    database.close();
    database = new FinanceDatabase(database.name);
    expect(await findFamily(database)).toEqual(family);
    const app = createFinanceApplication(family.id, database);
    const expense = (await app.services.expenses.list()).find(item => item.name === 'Alimentación')!;
    await app.services.expenses.update(expense.id, { amount: 450000 });
    const model = createDashboardModel(await loadWorkspace(app, family.id), app.calculators, '2026-09', '2026-09-30');
    expect(model.budget.available).toBe(1520000);
    expect(model.summary.totalExpenses).toBe(660000);
  });

  it('uses the existing expense calculator for the selected onboarding total', () => {
    expect(selectedExpenseTotal(input.expenses)).toBe(620000);
    expect(selectedExpenseTotal([])).toBe(0);
  });
});

describe('peso input presentation', () => {
  it.each([['2.370.000', '2370000'], ['$ 123.000', '123000'], ['1.234,50', '1234.50'], ['', '']])('normalizes %s to an unformatted value', (typed, canonical) => {
    expect(parseCurrencyInput(typed)).toBe(canonical);
  });
  it.each(['-50', 'abc', 'Infinity', '9007199254740992'])('rejects %s instead of changing its financial meaning', typed => {
    expect(parseCurrencyInput(typed)).toBeNull();
  });
  it('formats peso values and preserves decimal input precision', () => {
    expect(displayCurrencyInput('2370000')).toBe('2.370.000');
    expect(displayCurrencyInput('1234.50')).toBe('1.234,50');
    expect(formatMoney(2370000)).toBe('$2.370.000');
  });
});
