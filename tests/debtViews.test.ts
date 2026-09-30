import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { FinanceDatabase } from '../src/infrastructure/storage/FinanceDatabase';
import { createFinanceSession } from '../src/app/services/financeSession';
import { createFinanceApplication } from '../src/app/services/createFinanceApplication';
import { findFamily, loadWorkspace, localDate } from '../src/app/services/financeWorkspace';
import { debtOverview, debtPlanView, normalizeDebtOrder } from '../src/app/services/debtViews';
import type { DebtPlanStrategy } from '../src/features/debt-plan/services/DebtPlanner';

describe('Block C: real debts and payoff views', () => {
  let db: FinanceDatabase;
  beforeEach(async () => {
    db = new FinanceDatabase(`block-c-${crypto.randomUUID()}`);
    await createFinanceSession(db).initialize({ income: 0, expenses: [], debts: [], savings: 0 });
  });
  afterEach(async () => {
    db.close();
    await db.delete();
  });
  async function setup() {
    const family = (await findFamily(db))!;
    const app = createFinanceApplication(family.id, db);
    const load = () => loadWorkspace(app, family.id);
    const add = (
      name: string,
      principal: number,
      minimumPayment: number,
      annualInterestRate = 0,
      remainingBalance = principal,
    ) =>
      app.services.debts.create({
        name,
        principal,
        remainingBalance,
        minimumPayment,
        annualInterestRate,
        creditor: 'Acreedor del test',
        dueDay: 31,
      });
    return { app, load, add };
  }
  it('renders empty data without an invented date or debts', async () => {
    const { app, load } = await setup();
    const data = await load();
    expect(debtOverview(data, app.calculators)).toMatchObject({
      total: 0,
      activeCount: 0,
      cards: [],
    });
    expect(debtPlanView(data, app.calculators).plan).toMatchObject({
      estimatedMonths: 0,
      estimatedDebtFreeMonth: null,
    });
  });
  it('calculates totals and progress from current balances, excluding settled debts from active count', async () => {
    const { app, load, add } = await setup();
    await add('Parcial', 80000, 10000, 0, 60000);
    await add('Liquidada', 20000, 1000, 0, 0);
    const model = debtOverview(await load(), app.calculators);
    expect(model).toMatchObject({
      total: 60000,
      activeCount: 1,
      progress: { paidAmount: 40000, percentage: 40 },
    });
    expect(model.cards.find((card) => card.debt.name === 'Liquidada')).toMatchObject({
      progress: { percentage: 100 },
    });
    expect(model.cards.find((card) => card.debt.name === 'Liquidada')?.nextPayment).toBeUndefined();
  });
  it('uses the existing next-due calculation at month end', async () => {
    const { app, load, add } = await setup();
    await add('Fin de mes', 10000, 1000);
    expect(debtOverview(await load(), app.calculators, '2031-02-01').cards[0]?.nextPayment).toBe(
      '2031-02-28',
    );
  });
  it('projects one zero-interest debt with actual months and balances', async () => {
    const { app, load, add } = await setup();
    const debt = await add('Una deuda', 81000, 9000);
    const model = debtPlanView(await load(), app.calculators, 'snowball', [], '2031-01-12');
    expect(model.plan).toMatchObject({
      estimatedMonths: 9,
      estimatedDebtFreeMonth: '2031-10',
      totalInterest: 0,
      priorityOrder: [debt.id],
    });
    expect(model.timeline[0]).toMatchObject({
      month: '2031-02',
      totalPayment: 9000,
      remainingDebt: 72000,
      priorityId: debt.id,
    });
    expect(model.timeline.at(-1)).toMatchObject({ remainingDebt: 0, settled: [debt.id] });
  });
  it.each<DebtPlanStrategy>(['snowball', 'avalanche', 'custom'])(
    'delegates %s directly to DebtPlanner',
    async (strategy) => {
      const { app, load, add } = await setup();
      const a = await add('Menor saldo', 81000, 9000);
      const b = await add('Mayor interés', 245000, 14000, 24);
      const data = await load();
      const order = [b.id, a.id];
      const result = debtPlanView(data, app.calculators, strategy, order, '2031-01-12');
      const expected = app.calculators.debtPlan.calculate({
        debts: data.debts,
        strategy,
        customOrder: order,
        extraMonthlyPayment: 0,
        startMonth: '2031-02',
      });
      expect(result.plan).toEqual(expected);
      expect(result.timeline[0]?.priorityId).toBe(strategy === 'snowball' ? a.id : b.id);
      expect(result.timeline.map(({ month, remainingDebt }) => ({ month, remainingDebt }))).toEqual(
        expected.monthlyProjection.map(({ month, remainingDebt }) => ({ month, remainingDebt })),
      );
    },
  );
  it('changes priorities without mutating debts or recording simulated payments', async () => {
    const { app, load, add } = await setup();
    const a = await add('A', 100, 10);
    const b = await add('B', 300, 15, 36);
    const data = await load();
    expect(debtPlanView(data, app.calculators, 'snowball').plan?.priorityOrder[0]).toBe(a.id);
    expect(debtPlanView(data, app.calculators, 'avalanche').plan?.priorityOrder[0]).toBe(b.id);
    expect((await load()).debtPayments).toEqual([]);
    expect((await load()).debts).toEqual(data.debts);
  });
  it('normalizes stale custom priority after a settled debt and a new debt', async () => {
    const { app, load, add } = await setup();
    const a = await add('Saldada', 100, 10, 0, 0);
    const b = await add('Activa', 100, 10);
    const c = await add('Nueva', 300, 20);
    const data = await load();
    const order = normalizeDebtOrder([a.id, b.id, b.id, crypto.randomUUID()], data.debts);
    expect(order).toEqual([b.id, c.id]);
    expect(debtPlanView(data, app.calculators, 'custom', order).error).toBe('');
  });
  it('updates cards, payment history and the projection after a real payment', async () => {
    const { app, load, add } = await setup();
    const debt = await add('Pago real', 81000, 9000);
    const before = debtPlanView(await load(), app.calculators);
    await createFinanceSession(db).recordMovement({
      kind: 'debt-payment',
      debtId: debt.id,
      amount: 18000,
      name: 'Pago registrado',
      date: localDate(),
      category: 'Deuda',
      expenseKind: 'variable',
      frequency: 'occasional',
      paymentMethod: 'cash',
      note: '',
      repeatMonthly: false,
    });
    const data = await load();
    const overview = debtOverview(data, app.calculators);
    expect(overview.total).toBe(63000);
    expect(overview.cards[0]?.payments).toHaveLength(1);
    expect(before.plan?.estimatedMonths).toBe(9);
    expect(debtPlanView(data, app.calculators).plan?.estimatedMonths).toBe(7);
  });
  it('persists debts, payments and custom strategy across reopening', async () => {
    const { app, load, add } = await setup();
    const a = await add('Persistente A', 500, 50);
    const b = await add('Persistente B', 900, 100);
    await app.services.debts.registerPayment(a.id, { amount: 100, date: localDate() });
    await app.services.financialSettings.update({
      currency: 'COP',
      locale: 'es-CO',
      weekStartsOn: 1,
      debtPlan: { strategy: 'custom', customOrder: [b.id, a.id] },
    });
    const before = debtPlanView(await load(), app.calculators);
    db.close();
    await db.open();
    const data = await load();
    expect(data.debtPayments).toHaveLength(1);
    expect(data.settings?.debtPlan).toEqual({ strategy: 'custom', customOrder: [b.id, a.id] });
    expect(debtPlanView(data, app.calculators).plan).toEqual(before.plan);
  });
  it.each([
    [1000, 1, 120],
    [1000, 0, 0],
    [100000, 1, 0],
  ])('explains impossible or non-convergent plan %j', async (principal, minimum, rate) => {
    const { app, load, add } = await setup();
    await add('Sin plan viable', principal, minimum, rate);
    const result = debtPlanView(await load(), app.calculators);
    expect(result.plan).toBeNull();
    expect(result.error.length).toBeGreaterThan(0);
    expect(result.timeline).toEqual([]);
  });
  it('supports a long timeline using all real projection months', async () => {
    const { app, load, add } = await setup();
    await add('Plazo largo', 50000, 100);
    const result = debtPlanView(await load(), app.calculators);
    expect(result.timeline).toHaveLength(500);
    expect(result.timeline.at(-1)?.remainingDebt).toBe(0);
  });
});
