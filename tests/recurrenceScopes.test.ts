import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceDatabase } from '../src/infrastructure/storage/FinanceDatabase';
import { createFinanceApplication } from '../src/app/services/createFinanceApplication';
import {
  completeOnboarding,
  loadWorkspace,
  materializeRecurringExpenses,
  saveMovement,
} from '../src/app/services/financeWorkspace';
import { createFinanceSession } from '../src/app/services/financeSession';
import {
  financialTransactionSchema,
  type FinancialTransaction,
} from '../src/domain/models/financial';
import { createId } from '../src/shared/utils/ids';
import { parseFinanceBackup } from '../src/features/backup/services/financeBackup';
import { recoveryBackup } from './fixtures/recoveryBackup';
import { calendarEvents } from '../src/app/services/calendarModel';
import { movementHistory } from '../src/app/services/movementHistory';

describe('Phase 4.2B-1: recurrence scopes and historical rules', () => {
  let db: FinanceDatabase;
  let app: ReturnType<typeof createFinanceApplication>;
  let familyId: string;
  let source: FinancialTransaction;
  const patch = {
    name: 'Internet actualizado',
    amount: 120,
    date: '2026-10-31',
    recurrenceDay: 31,
  };
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
    db = new FinanceDatabase(`scopes-${createId()}`);
    const family = await completeOnboarding(
      db,
      { income: 1000, expenses: [], debts: [], savings: 0 },
      '2026-09-01',
    );
    familyId = family.id;
    app = createFinanceApplication(familyId, db);
    source = await series();
    await generate();
  });
  afterEach(async () => {
    db.close();
    await db.delete();
    vi.useRealTimers();
  });
  async function series(date = '2026-09-30') {
    return saveMovement(app, familyId, {
      kind: 'expense',
      name: 'Internet',
      amount: 100,
      date,
      category: 'Hogar',
      expenseKind: 'fixed',
      frequency: 'occasional',
      paymentMethod: 'cash',
      note: '',
      repeatMonthly: true,
    });
  }
  const generate = (date = '2026-12-01') => materializeRecurringExpenses(app, familyId, date);
  async function child(month = '2026-10', parent = source) {
    return (await db.transactions.toArray()).find(
      (t) => t.details?.recurrenceSourceId === parent.id && t.details.recurrenceMonth === month,
    )!;
  }
  async function edit(month: string, scope: 'single' | 'following' | 'all', input = patch) {
    await app.services.movements.change(await child(month), input, scope);
  }
  async function integrity() {
    const expenses = await db.expenses.toArray();
    const movements = (await db.transactions.toArray()).filter((t) => t.kind === 'expense');
    for (const t of movements)
      expect(expenses.some((e) => e.id === t.relatedEntityId && e.familyId === t.familyId)).toBe(
        true,
      );
    for (const e of expenses)
      expect(movements.filter((t) => t.relatedEntityId === e.id)).toHaveLength(1);
    const keys = movements
      .filter((t) => t.details?.recurrenceSourceId)
      .map((t) => `${t.familyId}:${t.details!.recurrenceSourceId}:${t.details!.recurrenceMonth}`);
    expect(new Set(keys).size).toBe(keys.length);
  }
  it('single override preserves the origin and next months across rematerialization and reopening', async () => {
    const origin = await db.expenses.get(source.relatedEntityId!);
    const november = await child('2026-11');
    await edit('2026-10', 'single');
    const name = db.name;
    db.close();
    db = new FinanceDatabase(name);
    app = createFinanceApplication(familyId, db);
    await generate();
    await generate();
    expect(await db.expenses.get(source.relatedEntityId!)).toEqual(origin);
    expect(await db.transactions.get(source.id)).toEqual(source);
    expect(await child('2026-11')).toEqual(november);
    expect(await child()).toMatchObject({
      amount: 120,
      description: patch.name,
      details: { recurrenceMonth: '2026-10' },
    });
    await integrity();
  });
  it('single editing freezes the legacy period before moving its date to another month', async () => {
    const october = await child();
    const details = { ...october.details };
    delete details.recurrenceMonth;
    await db.transactions.put({ ...october, details });
    await app.services.movements.change(october, { ...patch, date: '2026-11-02' });
    await generate();
    expect((await child()).date).toBe('2026-11-02');
    await app.services.movements.change(await child(), null);
    await generate();
    expect(await child()).toBeUndefined();
    expect(await child('2026-11')).toBeDefined();
    expect((await db.transactions.get(source.id))!.details!.omittedMonths).toEqual(['2026-10']);
  });
  it('editing only the origin freezes rule values instead of altering all future generations', async () => {
    await app.services.movements.change(source, { ...patch, date: '2026-08-01' });
    await generate('2027-01-01');
    expect(await child('2027-01')).toMatchObject({
      amount: 100,
      description: 'Internet',
      date: '2027-01-30',
    });
    expect((await db.transactions.get(source.id))?.amount).toBe(120);
  });
  it('does not duplicate a legacy occurrence paid in a later month without recurrenceMonth', async () => {
    const october = await child();
    const details = { ...october.details };
    delete details.recurrenceMonth;
    await db.transactions.put({ ...october, details, date: '2026-11-01' });
    await app.services.expenses.markAsPaid(october.relatedEntityId!, '2026-11-01T12:00:00Z');
    await generate();
    await generate();
    expect(
      (await db.transactions.toArray()).filter((t) => t.details?.recurrenceSourceId === source.id),
    ).toHaveLength(3);
    expect(
      (await db.expenses.toArray()).filter((e) => e.dueDate.startsWith('2026-10')),
    ).toHaveLength(1);
  });
  it('following edits keep earlier months byte-for-byte and change selected, existing and new later months', async () => {
    const october = await child();
    const origin = await db.expenses.get(source.relatedEntityId!);
    await edit('2026-11', 'following');
    await generate('2027-01-01');
    await generate('2027-01-01');
    expect(await child()).toEqual(october);
    expect(await db.expenses.get(source.relatedEntityId!)).toEqual(origin);
    for (const month of ['2026-11', '2026-12', '2027-01'])
      expect((await child(month)).amount).toBe(120);
    expect((await child('2026-11')).date).toBe('2026-11-30');
    expect((await child('2026-12')).date).toBe('2026-12-31');
    await integrity();
  });
  it('revisions preserve earlier effective values when a second future change is saved', async () => {
    await edit('2026-10', 'following');
    await edit('2026-12', 'following', { ...patch, amount: 150, recurrenceDay: 28 });
    await generate('2027-01-01');
    expect((await child('2026-11')).amount).toBe(120);
    expect((await child('2027-01')).amount).toBe(150);
    expect(
      (await db.transactions.get(source.id))?.details?.recurrenceChanges?.map((c) => c.fromMonth),
    ).toEqual(['2026-10', '2026-12']);
  });
  it('a change replaces later scheduled revisions without creating duplicate periods', async () => {
    await edit('2026-12', 'following', { ...patch, amount: 150 });
    await edit('2026-11', 'following');
    expect((await child('2026-12')).amount).toBe(120);
    expect((await db.transactions.get(source.id))?.details?.recurrenceChanges).toHaveLength(1);
    await generate();
    await integrity();
  });
  it('following deletion stops selected and later pending periods but preserves earlier records and paid expenses', async () => {
    const october = await child();
    const december = await child('2026-12');
    await app.services.expenses.markAsPaid(december.relatedEntityId!, '2026-12-01T12:00:00Z');
    await app.services.movements.change(await child('2026-11'), null, 'following');
    await generate('2027-02-01');
    expect(await child()).toEqual(october);
    expect(await child('2026-11')).toBeUndefined();
    expect(await child('2026-12')).toEqual(december);
    expect(await child('2027-01')).toBeUndefined();
    expect((await db.transactions.get(source.id))?.details?.recurrenceStoppedFrom).toBe('2026-11');
    await integrity();
  });
  it('all edits apply from the current month, preserving earlier months and paid history', async () => {
    const october = await child();
    await app.services.expenses.markAsPaid(october.relatedEntityId!, '2026-10-01T12:00:00Z');
    const origin = await db.expenses.get(source.relatedEntityId!);
    await app.services.movements.change(source, patch, 'all');
    await generate('2027-01-01');
    expect(await child()).toEqual(october);
    expect(await db.expenses.get(source.relatedEntityId!)).toEqual(origin);
    expect((await child('2026-11')).amount).toBe(120);
    expect((await db.transactions.get(source.id))?.amount).toBe(source.amount);
    await integrity();
  });
  it('all deletion retains original history and older occurrences even if selected from the past', async () => {
    vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
    const october = await child();
    await app.services.movements.change(source, null, 'all');
    await generate('2027-04-01');
    expect(await child()).toEqual(october);
    expect(await db.expenses.get(source.relatedEntityId!)).toBeDefined();
    expect(await child('2026-11')).toBeUndefined();
    expect(await child('2026-12')).toBeUndefined();
    await integrity();
  });
  it('preserves omitted months across bulk edits and stops', async () => {
    await app.services.movements.change(await child(), null);
    await app.services.movements.change(source, patch, 'all');
    await generate();
    expect(await child()).toBeUndefined();
    expect((await db.transactions.get(source.id))?.details?.omittedMonths).toEqual(['2026-10']);
    expect((await child('2026-11')).amount).toBe(120);
  });
  it('will not implicitly reactivate a stopped series by editing', async () => {
    await app.services.movements.change(source, null, 'all');
    await expect(app.services.movements.change(source, patch, 'all')).rejects.toThrow('finalizada');
    await generate('2028-01-01');
    expect(await child('2027-01')).toBeUndefined();
  });
  it('isolates two same-name same-amount series', async () => {
    const other = await series();
    await generate();
    const otherOctober = await child('2026-10', other);
    await edit('2026-10', 'following');
    await app.services.movements.change(await child('2026-11'), null, 'following');
    expect(await child('2026-10', other)).toEqual(otherOctober);
    expect((await child('2026-11', other)).amount).toBe(100);
  });
  it('rejects cross-household and forged related-entity requests atomically', async () => {
    const foreign = createFinanceApplication(createId(), db);
    const october = await child();
    await expect(foreign.services.movements.change(october, patch, 'all')).rejects.toThrow();
    await expect(
      app.services.movements.change(
        { ...october, relatedEntityId: source.relatedEntityId },
        patch,
        'all',
      ),
    ).rejects.toThrow('cambió');
    expect(await db.transactions.get(source.id)).toEqual(source);
  });
  it('reads the actual series reference instead of the UI snapshot', async () => {
    const other = await series();
    await generate();
    const october = await child();
    await app.services.movements.change(
      { ...october, details: { recurrenceSourceId: other.id } },
      patch,
      'following',
    );
    expect((await child()).amount).toBe(120);
    expect((await child('2026-10', other)).amount).toBe(100);
  });
  it.each(['edit', 'delete'] as const)(
    'rolls back the rule and every related record on %s failure',
    async (operation) => {
      const before = await app.services.exportBackup();
      const november = await child('2026-11');
      if (operation === 'edit')
        db.expenses.hook('updating', (_mods, key) => {
          if (key === november.relatedEntityId) throw new Error('Disk failure');
        });
      else
        db.expenses.hook('deleting', (key) => {
          if (key === november.relatedEntityId) throw new Error('Disk failure');
        });
      await expect(
        app.services.movements.change(
          await child(),
          operation === 'edit' ? patch : null,
          'following',
        ),
      ).rejects.toThrow('Disk failure');
      expect(await app.services.exportBackup()).toEqual(before);
    },
  );
  it('preserves old financial totals and calendar history while updating pending projections', async () => {
    const before = await loadWorkspace(app, familyId);
    await edit('2026-11', 'following');
    const after = await loadWorkspace(app, familyId);
    expect(app.calculators.budget.calculate({ ...after, month: '2026-10' })).toEqual(
      app.calculators.budget.calculate({ ...before, month: '2026-10' }),
    );
    expect(calendarEvents(after, '2026-10')).toEqual(calendarEvents(before, '2026-10'));
    expect(app.calculators.budget.calculate({ ...after, month: '2026-11' }).expenses).toBe(120);
  });
  it('backup roundtrip through an empty FinanceSession preserves revisions, exceptions and stop boundaries', async () => {
    await edit('2026-10', 'following');
    await app.services.movements.change(await child('2026-11'), null);
    await app.services.movements.change(await child('2026-12'), null, 'following');
    const backup = await app.services.exportBackup();
    const name = db.name;
    await db.delete();
    db = new FinanceDatabase(name);
    await createFinanceSession(db).importBackup(JSON.stringify(backup), true);
    app = createFinanceApplication(familyId, db);
    await generate('2027-12-01');
    expect((await child()).amount).toBe(120);
    expect(await child('2026-11')).toBeUndefined();
    expect(await child('2026-12')).toBeUndefined();
    expect((await db.transactions.get(source.id))?.details).toEqual(
      backup.transactions.find((t) => t.id === source.id)?.details,
    );
    expect(db.verno).toBe(1);
    await integrity();
  });
  it('accepts old version-1 backups without normalization', async () => {
    const legacy = recoveryBackup();
    expect(parseFinanceBackup(JSON.stringify(legacy))).toEqual(legacy);
  });
  it.each(['income', 'expense'] as const)(
    'keeps legacy %s editing and deletion working without a ledger row',
    async (kind) => {
      const entity =
        kind === 'expense'
          ? await app.services.expenses.create({
              name: 'Legacy',
              amount: 25,
              kind: 'variable',
              dueDate: '2026-10-01',
            })
          : await app.services.incomes.create({
              name: 'Legacy',
              amount: 25,
              frequency: 'occasional',
              effectiveDate: '2026-10-01',
              isActive: true,
            });
      let item = movementHistory(await loadWorkspace(app, familyId)).find(
        (t) => t.relatedEntityId === entity.id,
      )!;
      await app.services.movements.change(item, { ...patch, amount: 30 });
      item = movementHistory(await loadWorkspace(app, familyId)).find(
        (t) => t.relatedEntityId === entity.id,
      )!;
      expect(item.amount).toBe(30);
      await app.services.movements.change(item, null);
      expect(
        movementHistory(await loadWorkspace(app, familyId)).find(
          (t) => t.relatedEntityId === entity.id,
        ),
      ).toBeUndefined();
    },
  );
  it.each([28, 29, 30, 31])(
    'preserves intended day %s through February and March, including leap years',
    async (day) => {
      await edit('2026-10', 'following', { ...patch, recurrenceDay: day });
      await generate('2028-03-01');
      expect((await child('2027-02')).date).toBe('2027-02-28');
      expect((await child('2028-02')).date).toBe(`2028-02-${Math.min(day, 29)}`);
      expect((await child('2028-03')).date).toBe(`2028-03-${day}`);
      expect((await child('2027-01')).date).toBe(`2027-01-${day}`);
      await integrity();
    },
  );
  it.each([0, 32, 1.5])('rejects invalid recurrence day %s without writing', async (day) => {
    await expect(edit('2026-10', 'all', { ...patch, recurrenceDay: day })).rejects.toThrow();
    expect(await db.transactions.get(source.id)).toEqual(source);
  });
  it('rejects out-of-order, duplicate or orphan rule revisions in a backup', () => {
    const revision = { fromMonth: '2026-10', name: 'Test', amount: 100, day: 31 };
    const base = { startMonth: '2026-09', name: 'Internet', amount: 100, day: 30 };
    for (const metadata of [
      { recurrenceChanges: [revision] },
      { recurrenceBase: base, recurrenceChanges: [revision, revision] },
      { recurrenceBase: base, recurrenceChanges: [{ ...revision, fromMonth: '2026-11' }, revision] },
      { recurrenceBase: base, recurrenceChanges: [{ ...revision, fromMonth: '2026-08' }] },
      { recurrenceBase: base, recurrenceStoppedFrom: '2026-08' },
    ]) {
      expect(
        financialTransactionSchema.safeParse({
          ...source,
          details: { ...source.details, ...metadata },
        }).success,
      ).toBe(false);
    }
  });
});
