import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceDatabase } from '../src/infrastructure/storage/FinanceDatabase';
import {
  createFinanceSession,
  type FinanceSession,
  type FinanceSnapshot,
} from '../src/app/services/financeSession';
import { createFinanceApplication } from '../src/app/services/createFinanceApplication';
import {
  findFamily,
  loadWorkspace,
  localDate,
  saveMovement,
  materializeRecurringExpenses,
  type MovementInput,
} from '../src/app/services/financeWorkspace';
import { filteredMovementHistory, movementHistory } from '../src/app/services/movementHistory';

describe('Block B: application transactions and payments', () => {
  let db: FinanceDatabase;
  let session: FinanceSession;
  let unsubscribe: (() => void) | undefined;
  const input = (patch: Partial<MovementInput> = {}): MovementInput => ({
    kind: 'income',
    name: 'Trabajo de prueba',
    amount: 137500,
    date: localDate(),
    category: 'Ingreso',
    expenseKind: 'variable',
    frequency: 'occasional',
    paymentMethod: 'transfer',
    note: '',
    repeatMonthly: false,
    ...patch,
  });
  async function workspace() {
    const family = (await findFamily(db))!;
    const app = createFinanceApplication(family.id, db);
    return { app, data: await loadWorkspace(app, family.id), family };
  }
  beforeEach(async () => {
    db = new FinanceDatabase(`block-b-${crypto.randomUUID()}`);
    session = createFinanceSession(db);
    await session.initialize({ income: 0, expenses: [], debts: [], savings: 0 });
  });
  it('repeats from the due date, preserving month-end and avoiding duplicate charges', async () => {
    await session.recordMovement(
      input({ kind: 'expense', date: '2030-12-12', dueDate: '2031-01-31', repeatMonthly: true }),
    );
    const { app, family } = await workspace();
    await materializeRecurringExpenses(app, family.id, '2031-03-01');
    await materializeRecurringExpenses(app, family.id, '2031-03-01');
    const { data } = await workspace();
    expect(data.expenses.map((item) => item.dueDate).sort()).toEqual([
      '2031-01-31',
      '2031-02-28',
      '2031-03-31',
    ]);
    expect(data.expenses.filter((item) => !item.paidAt)).toHaveLength(2);
    expect(data.transactions).toHaveLength(3);
  });
  afterEach(async () => {
    unsubscribe?.();
    unsubscribe = undefined;
    session.close();
    await db.delete();
  });

  it('keeps an empty history without manufacturing records', async () => {
    const { data } = await workspace();
    expect(movementHistory(data)).toEqual([]);
  });
  it('creates an income and updates the observed dashboard without reopening', async () => {
    const snapshots: FinanceSnapshot[] = [];
    unsubscribe = session.subscribe(
      (snapshot) => snapshots.push(snapshot),
      (error) => {
        throw error;
      },
    );
    await session.recordMovement(input());
    await expect.poll(() => snapshots.at(-1)?.data?.transactions.length).toBe(1);
    const snapshot = snapshots.at(-1)!;
    expect(
      snapshot.app!.calculators.budget.calculate({
        ...snapshot.data!,
        month: localDate().slice(0, 7),
      }),
    ).toMatchObject({ income: 137500, available: 137500 });
    expect(snapshot.data!.incomes[0]).toMatchObject({ amount: 137500, frequency: 'occasional' });
  });
  it('creates a paid expense, category and ledger entry atomically', async () => {
    await session.recordMovement(
      input({
        kind: 'expense',
        name: 'Mantenimiento registrado',
        category: 'Taller propio',
        amount: 47250,
        repeatMonthly: true,
        note: 'Comprobante del usuario',
      }),
    );
    const { app, data } = await workspace();
    expect(data.expenses[0]).toMatchObject({
      amount: 47250,
      kind: 'variable',
      dueDate: localDate(),
    });
    expect(data.expenses[0]?.paidAt).toBeTruthy();
    expect(data.expenseCategories[0]?.name).toBe('Taller propio');
    expect(data.transactions[0]?.details).toMatchObject({
      repeatMonthly: true,
      note: 'Comprobante del usuario',
      paymentMethod: 'transfer',
    });
    expect(
      app.calculators.budget.calculate({ ...data, month: localDate().slice(0, 7) }),
    ).toMatchObject({ expenses: 47250, available: -47250 });
    expect(movementHistory(data)).toHaveLength(1);
  });
  it('preserves payment date separately from an optional expense due date', async () => {
    await session.recordMovement(
      input({ kind: 'expense', dueDate: '2031-04-12', category: 'Elegida por usuario' }),
    );
    const { data } = await workspace();
    expect(data.expenses[0]?.dueDate).toBe('2031-04-12');
    expect(data.transactions[0]?.date).toBe(localDate());
    expect(data.expenses[0]?.paidAt).toBe(`${localDate()}T12:00:00.000Z`);
  });
  it.each(['all', 'income', 'expense', 'debt-payment'])(
    'filters %s without duplicate linked records',
    async (filter) => {
      const { app } = await workspace();
      const debt = await app.services.debts.create({
        name: 'Deuda de ensayo',
        creditor: 'Acreedor de prueba',
        principal: 419000,
        minimumPayment: 23000,
        annualInterestRate: 0,
        dueDay: 12,
      });
      await session.recordMovement(input());
      await session.recordMovement(input({ kind: 'expense', category: 'Categoría propia' }));
      await session.recordMovement(
        input({ kind: 'debt-payment', debtId: debt.id, category: 'Deuda', amount: 23000 }),
      );
      const { data } = await workspace();
      const rows = filteredMovementHistory(data, localDate().slice(0, 7), filter);
      expect(rows).toHaveLength(filter === 'all' ? 3 : 1);
      if (filter !== 'all') expect(rows[0]?.kind).toBe(filter);
      expect(filteredMovementHistory(data, '1999-01', filter)).toEqual([]);
    },
  );
  it('reduces debt and persists the payment, ledger and dashboard across reopening', async () => {
    const { app } = await workspace();
    const debt = await app.services.debts.create({
      name: 'Compra del usuario',
      creditor: 'Proveedor',
      principal: 419000,
      minimumPayment: 23000,
      annualInterestRate: 0,
      dueDay: 12,
    });
    await session.recordMovement(
      input({ kind: 'debt-payment', debtId: debt.id, category: 'Deuda', amount: 79000 }),
    );
    session.close();
    await db.open();
    session = createFinanceSession(db);
    const { app: reopened, data } = await workspace();
    expect(data.debts[0]?.remainingBalance).toBe(340000);
    expect(data.debtPayments).toHaveLength(1);
    expect(data.transactions[0]).toMatchObject({
      kind: 'debt-payment',
      amount: 79000,
      relatedEntityId: data.debtPayments[0]?.id,
    });
    expect(
      reopened.calculators.budget.calculate({ ...data, month: localDate().slice(0, 7) }),
    ).toMatchObject({ debtPayments: 79000, available: -79000 });
  });
  it('retains Phase 2 overpayment behavior: full payment recorded, balance clamped to zero', async () => {
    const { app } = await workspace();
    const debt = await app.services.debts.create({
      name: 'Último saldo',
      creditor: 'Usuario',
      principal: 35000,
      minimumPayment: 5000,
      annualInterestRate: 0,
      dueDay: 1,
    });
    await session.recordMovement(input({ kind: 'debt-payment', debtId: debt.id, amount: 40000 }));
    const { data } = await workspace();
    expect(data.debts[0]?.remainingBalance).toBe(0);
    expect(data.debtPayments[0]?.amount).toBe(40000);
    expect(data.transactions[0]?.amount).toBe(40000);
    await expect(
      session.recordMovement(input({ kind: 'debt-payment', debtId: debt.id })),
    ).rejects.toThrow();
    expect((await workspace()).data.transactions).toHaveLength(1);
  });
  it.each([
    { amount: 0 },
    { amount: -1 },
    { name: ' ' },
    { date: 'invalid' },
    { kind: 'debt-payment' as const },
  ])('rejects invalid input %j without partial records', async (patch) => {
    await expect(session.recordMovement(input(patch))).rejects.toThrow();
    const { data } = await workspace();
    expect(data.transactions).toEqual([]);
    expect(data.incomes).toEqual([]);
    expect(data.debtPayments).toEqual([]);
  });
  it('rolls back the debt payment if the ledger cannot be written', async () => {
    const { app, family } = await workspace();
    const debt = await app.services.debts.create({
      name: 'Pago atómico',
      creditor: 'Prueba',
      principal: 75000,
      minimumPayment: 5000,
      annualInterestRate: 0,
      dueDay: 1,
    });
    vi.spyOn(app.repositories.transactions, 'save').mockRejectedValueOnce(
      new Error('Storage failure'),
    );
    await expect(
      saveMovement(app, family.id, input({ kind: 'debt-payment', debtId: debt.id, amount: 17000 })),
    ).rejects.toThrow('Storage failure');
    const { data } = await workspace();
    expect(data.debts[0]?.remainingBalance).toBe(75000);
    expect(data.debtPayments).toEqual([]);
    expect(data.transactions).toEqual([]);
  });
});
