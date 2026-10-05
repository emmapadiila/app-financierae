import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FinanceDatabase } from '../src/infrastructure/storage/FinanceDatabase';
import { createFinanceApplication } from '../src/app/services/createFinanceApplication';
import {
  completeOnboarding,
  loadWorkspace,
  materializeRecurringExpenses,
  saveMovement,
} from '../src/app/services/financeWorkspace';
import { createFinanceSession, type FinanceSnapshot } from '../src/app/services/financeSession';
import { filteredMovementHistory } from '../src/app/services/movementHistory';
import { calendarEvents } from '../src/app/services/calendarModel';
import { createDashboardModel } from '../src/app/services/dashboardModel';
import { parseFinanceBackup } from '../src/features/backup/services/financeBackup';
import { recoveryBackup } from './fixtures/recoveryBackup';
import type { FinancialTransaction } from '../src/domain/models/financial';

describe('Phase 4.2A: persistent recurrence exceptions', () => {
  let db: FinanceDatabase;
  let app: ReturnType<typeof createFinanceApplication>;
  let familyId: string;
  let stop: (() => void) | undefined;
  beforeEach(async () => {
    db = new FinanceDatabase(`exceptions-${crypto.randomUUID()}`);
    const family = await completeOnboarding(
      db,
      { income: 1000, expenses: [], debts: [], savings: 0 },
      '2026-09-01',
    );
    familyId = family.id;
    app = createFinanceApplication(familyId, db);
  });
  afterEach(async () => {
    stop?.();
    stop = undefined;
    db.close();
    await db.delete();
  });
  const data = () => loadWorkspace(app, familyId);
  async function series(date = '2026-09-30', repeatMonthly = true) {
    return saveMovement(app, familyId, {
      kind: 'expense',
      name: 'Internet hogar',
      amount: 100,
      date,
      dueDate: date,
      category: 'Hogar',
      expenseKind: 'fixed',
      frequency: 'occasional',
      paymentMethod: 'cash',
      note: '',
      repeatMonthly,
    });
  }
  const generate = (date = '2026-11-01') => materializeRecurringExpenses(app, familyId, date);
  async function occurrence(source: FinancialTransaction, month = '2026-10') {
    const item = (await data()).transactions.find(
      (t) =>
        t.details?.recurrenceSourceId === source.id &&
        (t.details.recurrenceMonth ?? t.date.slice(0, 7)) === month,
    );
    if (!item) throw new Error('Missing test occurrence');
    return item;
  }
  const omitted = async (source: FinancialTransaction) =>
    (await db.transactions.get(source.id))?.details?.omittedMonths;

  it('deletes only October atomically, preserves September/November and never regenerates October', async () => {
    const source = await series();
    await generate();
    const october = await occurrence(source);
    const november = await occurrence(source, '2026-11');
    const septemberExpense = await db.expenses.get(source.relatedEntityId!);
    await app.services.movements.change(october, null);
    for (let i = 0; i < 3; i++) await generate();
    expect(await omitted(source)).toEqual(['2026-10']);
    expect(await db.expenses.get(october.relatedEntityId!)).toBeUndefined();
    expect(await db.transactions.get(october.id)).toBeUndefined();
    expect(await db.expenses.get(source.relatedEntityId!)).toEqual(septemberExpense);
    expect(await db.transactions.get(november.id)).toEqual(november);
    expect((await data()).expenses.map((e) => e.dueDate).sort()).toEqual([
      '2026-09-30',
      '2026-11-30',
    ]);
  });
  it('generates a later month normally without copying exceptions onto occurrences', async () => {
    const source = await series();
    await generate('2026-10-01');
    await app.services.movements.change(await occurrence(source), null);
    await generate();
    expect((await occurrence(source, '2026-11')).details?.omittedMonths).toBeUndefined();
    expect(await omitted(source)).toEqual(['2026-10']);
  });
  it('normal expense deletion creates no exception', async () => {
    const normal = await series('2026-10-01', false);
    await app.services.movements.change(normal, null);
    await generate();
    expect((await data()).expenses).toEqual([]);
    expect((await data()).transactions.some((t) => t.details?.omittedMonths)).toBe(false);
  });
  it('isolates same-name same-amount series by original transaction ID', async () => {
    const first = await series();
    const second = await series();
    await generate();
    const secondOctober = await occurrence(second);
    await app.services.movements.change(await occurrence(first), null);
    await generate();
    expect(await omitted(first)).toEqual(['2026-10']);
    expect(await omitted(second)).toBeUndefined();
    expect(await db.transactions.get(secondOctober.id)).toEqual(secondOctober);
  });
  it('rejects deleting another household occurrence without recording any exception', async () => {
    const source = await series();
    await generate();
    const october = await occurrence(source);
    const foreign = createFinanceApplication(crypto.randomUUID(), db);
    await expect(foreign.services.movements.change(october, null)).rejects.toThrow();
    expect(await omitted(source)).toBeUndefined();
    expect(await db.transactions.get(october.id)).toEqual(october);
    await app.services.movements.change(october, null);
    expect((await db.transactions.get(source.id))?.familyId).toBe(familyId);
  });
  it('keeps independent exceptions in two households sharing names, amounts and periods', async () => {
    const first = await series();
    const family = (await db.families.get(familyId))!;
    const secondFamilyId = crypto.randomUUID();
    await db.families.put({ ...family, id: secondFamilyId });
    const secondApp = createFinanceApplication(secondFamilyId, db);
    const second = await saveMovement(secondApp, secondFamilyId, {
      kind: 'expense', name: 'Internet hogar', amount: 100,
      date: '2026-09-30', dueDate: '2026-09-30', category: 'Hogar',
      expenseKind: 'fixed', frequency: 'occasional', paymentMethod: 'cash',
      note: '', repeatMonthly: true,
    });
    await generate();
    await materializeRecurringExpenses(secondApp, secondFamilyId, '2026-11-01');
    const secondChildren = (await db.transactions.toArray()).filter(t => t.details?.recurrenceSourceId === second.id);
    const secondOctober = secondChildren.find(t => t.details?.recurrenceMonth === '2026-10')!;
    const secondNovember = secondChildren.find(t => t.details?.recurrenceMonth === '2026-11')!;
    await app.services.movements.change(await occurrence(first), null);
    await secondApp.services.movements.change(secondNovember, null);
    await generate();
    await materializeRecurringExpenses(secondApp, secondFamilyId, '2026-11-01');
    expect(await omitted(first)).toEqual(['2026-10']);
    expect(await omitted(second)).toEqual(['2026-11']);
    expect(await db.transactions.get(secondOctober.id)).toEqual(secondOctober);
    expect(await occurrence(first, '2026-11')).toBeDefined();
    expect(await db.transactions.get(secondNovember.id)).toBeUndefined();
    for (const transaction of (await db.transactions.toArray()).filter(t => t.kind === 'expense')) {
      expect(await db.expenses.get(transaction.relatedEntityId!)).toBeDefined();
    }
  });
  it('rejects a corrupted cross-household source link atomically', async () => {
    const source = await series();
    await generate();
    const october = await occurrence(source);
    await db.transactions.put({ ...source, familyId: crypto.randomUUID() });
    await expect(app.services.movements.change(october, null)).rejects.toThrow('hogar');
    expect(await db.expenses.get(october.relatedEntityId!)).toBeDefined();
    expect(await omitted(source)).toBeUndefined();
  });
  it('uses persisted references instead of tampered UI metadata', async () => {
    const source = await series();
    const other = await series();
    await generate();
    const october = await occurrence(source);
    await app.services.movements.change(
      { ...october, details: { recurrenceSourceId: other.id, recurrenceMonth: '2026-11' } },
      null,
    );
    expect(await omitted(source)).toEqual(['2026-10']);
    expect(await omitted(other)).toBeUndefined();
  });
  it('removes all linked ledger entries and keeps only one exception', async () => {
    const source = await series();
    await generate();
    const october = await occurrence(source);
    await db.transactions.put({ ...october, id: crypto.randomUUID() });
    await app.services.movements.change(october, null);
    expect(
      (await data()).transactions.filter((t) => t.relatedEntityId === october.relatedEntityId),
    ).toEqual([]);
    expect(await omitted(source)).toEqual(['2026-10']);
  });
  it('does not expose omitted occurrences or metadata in history, calendar, budget, dashboard or report calculations', async () => {
    const source = await series();
    await generate();
    await app.services.movements.change(await occurrence(source), null);
    await generate();
    const workspace = await data();
    expect(filteredMovementHistory(workspace, '2026-10')).toEqual([]);
    expect(calendarEvents(workspace, '2026-10', '2026-10-01')).toEqual([]);
    expect(app.calculators.budget.calculate({ ...workspace, month: '2026-10' })).toMatchObject({
      expenses: 0,
      available: 1000,
    });
    const dashboard = createDashboardModel(workspace, app.calculators, '2026-10', '2026-10-01');
    expect(dashboard.summary.totalExpenses).toBe(0);
    expect(dashboard.summary.expenseDistribution).toEqual([]);
    expect(
      ['2026-09', '2026-10', '2026-11'].map(
        (month) => app.calculators.budget.calculate({ ...workspace, month }).expenses,
      ),
    ).toEqual([100, 0, 100]);
  });
  it('persists several exceptions across a year boundary while subsequent periods still generate', async () => {
    const source = await series('2026-11-30');
    await generate('2027-02-01');
    for (const month of ['2026-12', '2027-01'])
      await app.services.movements.change(await occurrence(source, month), null);
    await generate('2027-03-01');
    await generate('2027-03-01');
    expect(await omitted(source)).toEqual(['2026-12', '2027-01']);
    expect((await data()).expenses.map((e) => e.dueDate).sort()).toEqual([
      '2026-11-30',
      '2027-02-28',
      '2027-03-30',
    ]);
  });
  it.each([28, 29, 30, 31])(
    'handles day %s at February month-end without losing the original day',
    async (day) => {
      const source = await series(`2028-01-${day}`);
      await generate('2028-02-01');
      expect((await occurrence(source, '2028-02')).date).toBe(`2028-02-${Math.min(day, 29)}`);
      await app.services.movements.change(await occurrence(source, '2028-02'), null);
      await generate('2028-03-01');
      expect(await omitted(source)).toEqual(['2028-02']);
      expect((await occurrence(source, '2028-03')).date).toBe(`2028-03-${day}`);
    },
  );
  it('preserves the existing source deletion behavior, including already generated occurrences', async () => {
    const source = await series();
    await generate();
    await app.services.movements.change(await occurrence(source), null);
    const november = await occurrence(source, '2026-11');
    await app.services.movements.change(source, null);
    await generate('2026-12-01');
    expect((await data()).expenses).toHaveLength(1);
    expect(await db.transactions.get(november.id)).toEqual(november);
    await app.services.movements.change(november, null);
    expect((await data()).expenses).toEqual([]);
  });
  it('rolls back the exception and expense deletion if ledger deletion fails', async () => {
    const source = await series();
    await generate();
    const october = await occurrence(source);
    db.transactions.hook('deleting', (key) => {
      if (key === october.id) throw new Error('Disk failure');
    });
    await expect(app.services.movements.change(october, null)).rejects.toThrow('Disk failure');
    expect(await omitted(source)).toBeUndefined();
    expect(await db.expenses.get(october.relatedEntityId!)).toBeDefined();
    expect(await db.transactions.get(october.id)).toEqual(october);
  });
  it('serializes deletions of different months without losing exceptions', async () => {
    const source = await series();
    await generate();
    const october = await occurrence(source);
    const november = await occurrence(source, '2026-11');
    await Promise.all([
      app.services.movements.change(october, null),
      app.services.movements.change(november, null),
    ]);
    await generate();
    expect(await omitted(source)).toEqual(['2026-10', '2026-11']);
    expect((await data()).expenses).toHaveLength(1);
  });
  it('retains exclusions after reopening IndexedDB and restarting FinanceSession', async () => {
    const source = await series();
    await generate();
    await app.services.movements.change(await occurrence(source), null);
    const name = db.name;
    db.close();
    db = new FinanceDatabase(name);
    app = createFinanceApplication(familyId, db);
    const session = createFinanceSession(db);
    const snapshots: FinanceSnapshot[] = [];
    stop = session.subscribe(
      (snapshot) => snapshots.push(snapshot),
      (error) => {
        throw error;
      },
    );
    await expect.poll(() => snapshots.at(-1)?.family?.id).toBe(familyId);
    await generate();
    expect(await omitted(source)).toEqual(['2026-10']);
    expect((await data()).expenses.some((e) => e.dueDate.startsWith('2026-10'))).toBe(false);
  });
  it('exports exceptions, restores without a household and still respects them after materialization', async () => {
    const source = await series();
    await generate();
    await app.services.movements.change(await occurrence(source), null);
    const backup = await app.services.exportBackup();
    expect(backup.transactions.find((t) => t.id === source.id)?.details?.omittedMonths).toEqual([
      '2026-10',
    ]);
    const name = db.name;
    await db.delete();
    db = new FinanceDatabase(name);
    await createFinanceSession(db).importBackup(JSON.stringify(backup), true);
    app = createFinanceApplication(familyId, db);
    await generate();
    expect(await omitted(source)).toEqual(['2026-10']);
    expect((await data()).expenses.map((e) => e.dueDate).sort()).toEqual([
      '2026-09-30',
      '2026-11-30',
    ]);
  });
  it('restores unchanged old version-1 backups exactly', async () => {
    const legacy = recoveryBackup();
    await createFinanceSession(db).importBackup(JSON.stringify(legacy), true);
    const restored = await createFinanceApplication(legacy.family!.id, db).services.exportBackup();
    expect({ ...restored, exportedAt: legacy.exportedAt }).toEqual(legacy);
    expect(db.verno).toBe(1);
  });
  it('opens legacy records without migration and records an exception for a legacy generated occurrence', async () => {
    const source = await series();
    await generate();
    const october = await occurrence(source);
    const legacyDetails = { ...october.details };
    delete legacyDetails.recurrenceMonth;
    await db.transactions.put({ ...october, details: legacyDetails });
    const before = await app.services.exportBackup();
    const name = db.name;
    db.close();
    db = new FinanceDatabase(name);
    app = createFinanceApplication(familyId, db);
    const reopened = await app.services.exportBackup();
    expect({ ...reopened, exportedAt: before.exportedAt }).toEqual(before);
    expect(db.verno).toBe(1);
    await app.services.movements.change((await db.transactions.get(october.id))!, null);
    await generate();
    expect(await omitted(source)).toEqual(['2026-10']);
    expect(await db.expenses.get(october.relatedEntityId!)).toBeUndefined();
  });
  it('uses the occurrence period rather than a later payment date', async () => {
    const source = await series();
    await generate();
    const october = await occurrence(source);
    await app.services.expenses.markAsPaid(october.relatedEntityId!, '2026-11-01T12:00:00.000Z');
    await app.services.movements.change(october, {
      name: october.description,
      amount: 100,
      date: '2026-11-01',
    });
    await app.services.movements.change((await db.transactions.get(october.id))!, null);
    await generate();
    expect(await omitted(source)).toEqual(['2026-10']);
    expect(await occurrence(source, '2026-11')).toBeDefined();
  });
  it.each(['original-period', 'child-exceptions'])(
    'rejects recurrence metadata on the wrong record: %s',
    async (kind) => {
      const source = await series();
      await generate();
      const child = await occurrence(source);
      const backup = await app.services.exportBackup();
      const target = kind === 'original-period' ? source.id : child.id;
      backup.transactions = backup.transactions.map((item) =>
        item.id !== target
          ? item
          : {
              ...item,
              details: {
                ...item.details,
                ...(kind === 'original-period'
                  ? { recurrenceMonth: '2026-10' }
                  : { omittedMonths: ['2026-10'] }),
              },
            },
      );
      expect(() => parseFinanceBackup(JSON.stringify(backup))).toThrow();
    },
  );
  it.each([['2026-13'], ['2026-10', '2026-10']])(
    'rejects invalid exception periods in backups: %s',
    async (...months) => {
      const source = await series();
      const backup = await app.services.exportBackup();
      const modified = {
        ...backup,
        transactions: backup.transactions.map((t) =>
          t.id === source.id ? { ...t, details: { ...t.details, omittedMonths: months } } : t,
        ),
      };
      expect(() => parseFinanceBackup(JSON.stringify(modified))).toThrow();
      await expect(
        createFinanceSession(db).importBackup(JSON.stringify(modified), true),
      ).rejects.toThrow();
      expect(await omitted(source)).toBeUndefined();
    },
  );
});
