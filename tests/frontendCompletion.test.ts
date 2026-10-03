import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FinanceDatabase } from '../src/infrastructure/storage/FinanceDatabase';
import {
  completeOnboarding,
  loadWorkspace,
  saveMovement,
} from '../src/app/services/financeWorkspace';
import { createFinanceApplication } from '../src/app/services/createFinanceApplication';
import { movementHistory } from '../src/app/services/movementHistory';
import { calendarEvents } from '../src/app/services/calendarModel';

describe('completed frontend operations preserve persisted finance data', () => {
  let db: FinanceDatabase;
  beforeEach(() => {
    db = new FinanceDatabase(`frontend-${crypto.randomUUID()}`);
  });
  afterEach(async () => {
    db.close();
    await db.delete();
  });
  async function setup() {
    const family = await completeOnboarding(
      db,
      { income: 1200, expenses: [], debts: [], savings: 0 },
      '2026-10-01',
    );
    return { family, app: createFinanceApplication(family.id, db) };
  }
  it('deleting a debt also removes its linked payment ledger without leaving orphan records', async () => {
    const { family, app } = await setup();
    const debt = await app.services.debts.create({
      name: 'Test debt',
      creditor: 'Test',
      principal: 800,
      minimumPayment: 80,
      annualInterestRate: 0,
    });
    await saveMovement(app, family.id, {
      kind: 'debt-payment',
      name: 'Installment',
      amount: 80,
      date: '2026-10-03',
      category: 'Deuda',
      expenseKind: 'variable',
      frequency: 'occasional',
      debtId: debt.id,
      paymentMethod: 'cash',
      note: '',
      repeatMonthly: false,
    });
    await app.services.removeDebt(debt.id);
    expect(await app.services.debts.list()).toEqual([]);
    expect(await db.debtPayments.count()).toBe(0);
    expect((await db.transactions.toArray()).some((t) => t.kind === 'debt-payment')).toBe(false);
    expect((await app.services.exportBackup()).incomes).toHaveLength(1);
  });
  it('updates and removes the income and its linked ledger atomically', async () => {
    const { family, app } = await setup();
    const data = await loadWorkspace(app, family.id);
    const movement = movementHistory(data)[0]!;
    await app.services.movements.change(movement, {
      name: 'Updated',
      amount: 1400,
      date: '2026-10-03',
    });
    const after = await loadWorkspace(app, family.id);
    expect(after.incomes[0]?.amount).toBe(1400);
    expect(after.transactions[0]?.amount).toBe(1400);
    expect(app.calculators.budget.calculate({ ...after, month: '2026-10' }).income).toBe(1400);
    await app.services.movements.change(movement, null);
    expect(await app.services.incomes.list()).toEqual([]);
    expect(await db.transactions.count()).toBe(0);
  });
  it('preserves a paid expense due date when editing its payment date', async () => {
    const { family, app } = await setup();
    const movement = await saveMovement(app, family.id, {
      kind: 'expense',
      name: 'Bill',
      amount: 80,
      date: '2026-10-02',
      dueDate: '2026-11-01',
      category: 'Utilities',
      expenseKind: 'fixed',
      frequency: 'occasional',
      paymentMethod: 'cash',
      note: '',
      repeatMonthly: false,
    });
    await app.services.movements.change(movement, {
      name: 'Bill edited',
      amount: 90,
      date: '2026-10-04',
    });
    const expense = (await app.services.expenses.list())[0]!;
    expect(expense.dueDate).toBe('2026-11-01');
    expect(expense.paidAt?.slice(0, 10)).toBe('2026-10-04');
    expect((await db.transactions.get(movement.id))?.date).toBe('2026-10-04');
  });
  it('rejects invalid or foreign movement edits without partial writes', async () => {
    const { family, app } = await setup();
    const movement = movementHistory(await loadWorkspace(app, family.id))[0]!;
    await expect(
      app.services.movements.change(movement, { name: '', amount: -1, date: 'invalid' }),
    ).rejects.toThrow();
    await expect(
      app.services.movements.change({ ...movement, familyId: crypto.randomUUID() }, null),
    ).rejects.toThrow();
    expect((await app.services.incomes.list())[0]?.amount).toBe(1200);
    expect(await db.transactions.count()).toBe(1);
  });
  it('upserts one monthly plan and never creates actual income, expenses or savings', async () => {
    const { family, app } = await setup();
    const draft = {
      month: '2026-11',
      plannedIncome: 1500,
      plannedFixedExpenses: 200,
      plannedVariableExpenses: 100,
      plannedDebtPayments: 50,
      plannedSavings: 70,
    };
    await Promise.all([
      app.services.monthlyBudget.save(draft),
      app.services.monthlyBudget.save({ ...draft, plannedSavings: 80 }),
    ]);
    const data = await loadWorkspace(app, family.id);
    expect(data.budgets.filter((b) => b.month === '2026-11')).toHaveLength(1);
    expect(data.expenses).toHaveLength(0);
    expect(data.savingsTransactions).toHaveLength(0);
    expect(data.incomes).toHaveLength(1);
    await expect(
      app.services.monthlyBudget.save({ ...draft, plannedIncome: -1 }),
    ).rejects.toThrow();
  });
  it('shows savings contributions and withdrawals once in movement history', async () => {
    const { family, app } = await setup();
    const goal = await app.services.savings.createGoal({ name: 'Reserve', targetAmount: 500 });
    await app.services.savings.contribute(goal.id, { amount: 200, date: '2026-10-03' });
    await app.services.savings.withdraw(goal.id, { amount: 50, date: '2026-10-04' });
    const data = await loadWorkspace(app, family.id);
    expect(movementHistory(data).filter((m) => m.kind.startsWith('savings-'))).toHaveLength(2);
    expect(app.calculators.budget.calculate({ ...data, month: '2026-10' }).savings).toBe(150);
  });
  it('calendar handles February, paid and overdue bills without inventing overdue debt', async () => {
    const { family, app } = await setup();
    await app.services.expenses.create({
      name: 'Unpaid',
      amount: 10,
      kind: 'fixed',
      dueDate: '2027-02-02',
    });
    const paid = await app.services.expenses.create({
      name: 'Paid',
      amount: 20,
      kind: 'variable',
      dueDate: '2027-02-01',
    });
    await app.services.expenses.markAsPaid(paid.id);
    await app.services.debts.create({
      name: 'Loan',
      creditor: 'Test',
      principal: 300,
      minimumPayment: 30,
      annualInterestRate: 0,
      dueDay: 31,
    });
    const events = calendarEvents(await loadWorkspace(app, family.id), '2027-02', '2027-02-03');
    expect(events.find((e) => e.name === 'Unpaid')?.status).toBe('overdue');
    expect(events.find((e) => e.name === 'Paid')?.status).toBe('paid');
    expect(events.find((e) => e.name === 'Loan')?.date).toBe('2027-02-28');
    expect(events.find((e) => e.name === 'Loan')?.status).toBe('planned');
  });
});
