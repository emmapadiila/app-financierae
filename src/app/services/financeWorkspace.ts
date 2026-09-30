import { z } from 'zod';
import { createFinanceApplication } from './createFinanceApplication';
import { FinanceDatabase } from '../../infrastructure/storage/FinanceDatabase';
import { FamilyService } from '../../features/settings/services/FamilyService';
import { createIndexedDbFinanceStore } from '../../infrastructure/storage/indexedDbRepositories';
import { BudgetCalculator } from '../../features/budget/services/BudgetCalculator';
import { expenseCategorySchema, financialTransactionSchema, monthlyBudgetSchema, type Family, type FinancialTransaction } from '../../domain/models/financial';
import { addMonthsToMonth, currentTimestamp, monthRange } from '../../shared/utils/dates';
import { createId } from '../../shared/utils/ids';

export type FinanceApplication = ReturnType<typeof createFinanceApplication>;
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const money = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
const draftExpense = z.object({ name: z.string().trim().min(1).max(120), category: z.string().trim().min(1).max(80), amount: money.positive() });
const draftDebt = z.object({ name: z.string().trim().min(1).max(120), creditor: z.string().trim().min(1).max(120), principal: money.positive(), minimumPayment: money, annualInterestRate: money.max(1000), dueDay: z.number().int().min(1).max(31) });
export const onboardingSchema = z.object({ income: money, expenses: z.array(draftExpense), debts: z.array(draftDebt), savings: money });
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const movementSchema = z.object({
  kind: z.enum(['income', 'expense', 'debt-payment']),
  amount: money.positive(), name: z.string().trim().min(1).max(120),
  date: z.iso.date(), category: z.string().trim().min(1).max(80),
  expenseKind: z.enum(['fixed', 'variable']), frequency: z.enum(['occasional', 'monthly', 'biweekly', 'weekly']),
  debtId: z.uuid().optional(), paymentMethod: z.enum(['cash', 'card', 'transfer', 'wallet']),
  note: z.string().trim().max(500), repeatMonthly: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.kind === 'debt-payment' && !value.debtId) ctx.addIssue({ code: 'custom', path: ['debtId'], message: 'Selecciona la deuda que vas a pagar.' });
});
export type MovementInput = z.infer<typeof movementSchema>;

export async function findFamily(database: FinanceDatabase): Promise<Family | null> {
  return (await createIndexedDbFinanceStore(database).repositories.families.list())[0] ?? null;
}

async function categoryId(app: FinanceApplication, familyId: string, name: string) {
  const existing = (await app.repositories.expenseCategories.list()).find(item => item.familyId === familyId && item.name === name);
  if (existing) return existing.id;
  const timestamp = currentTimestamp();
  const category = expenseCategorySchema.parse({ id: createId(), familyId, name, createdAt: timestamp, updatedAt: timestamp });
  await app.repositories.expenseCategories.save(category);
  return category.id;
}

async function record(app: FinanceApplication, familyId: string, input: Pick<FinancialTransaction, 'kind' | 'description' | 'amount' | 'date' | 'relatedEntityId' | 'details'>) {
  const timestamp = currentTimestamp();
  const movement = financialTransactionSchema.parse({ ...input, familyId, id: createId(), createdAt: timestamp, updatedAt: timestamp });
  await app.repositories.transactions.save(movement);
  return movement;
}

// Coordination only: domain services own validation and financial mutations.
// The ledger and source entity commit together, so summaries never double-count it.
export async function saveMovement(app: FinanceApplication, familyId: string, raw: MovementInput) {
  const input = movementSchema.parse(raw);
  return app.database.transaction('rw', app.database.tables, async () => {
    let relatedEntityId: string;
    if (input.kind === 'income') {
      const income = await app.services.incomes.create({ name: input.name, amount: input.amount, effectiveDate: input.date, frequency: input.frequency, isActive: true });
      relatedEntityId = income.id;
    } else if (input.kind === 'expense') {
      const expense = await app.services.expenses.create({ name: input.name, amount: input.amount, dueDate: input.date, kind: input.expenseKind, categoryId: await categoryId(app, familyId, input.category) });
      await app.services.expenses.markAsPaid(expense.id, `${input.date}T12:00:00.000Z`);
      relatedEntityId = expense.id;
    } else {
      const result = await app.services.debts.registerPayment(input.debtId!, { amount: input.amount, date: input.date, note: input.note });
      relatedEntityId = result.payment.id;
    }
    return record(app, familyId, { kind: input.kind, description: input.name, amount: input.amount, date: input.date, relatedEntityId,
      details: { categoryName: input.category, paymentMethod: input.paymentMethod, note: input.note, repeatMonthly: input.kind === 'expense' && input.repeatMonthly } });
  });
}

// User-entered draft amounts, never sample data. This is a projected budget,
// not an assertion that future payments or savings contributions already happened.
export function previewOnboarding(raw: OnboardingInput, date: string) {
  const input = onboardingSchema.parse(raw);
  const familyId = createId();
  const timestamp = currentTimestamp();
  const base = { familyId, createdAt: timestamp, updatedAt: timestamp };
  return new BudgetCalculator().calculate({
    month: date.slice(0, 7),
    incomes: input.income ? [{ ...base, id: createId(), name: 'Ingreso del hogar', amount: input.income, frequency: 'monthly', effectiveDate: date, isActive: true }] : [],
    expenses: input.expenses.map(item => ({ ...base, id: createId(), name: item.name, amount: item.amount, dueDate: date, kind: 'fixed' as const })),
    debtPayments: input.debts.map(item => ({ ...base, id: createId(), debtId: createId(), amount: item.minimumPayment, date })),
    savingsTransactions: input.savings ? [{ ...base, id: createId(), goalId: createId(), amount: input.savings, date, kind: 'contribution' }] : [],
  });
}

export async function completeOnboarding(database: FinanceDatabase, raw: OnboardingInput, date = localDate()) {
  const input = onboardingSchema.parse(raw);
  return database.transaction('rw', database.tables, async () => {
    const store = createIndexedDbFinanceStore(database);
    const family = await new FamilyService(store.repositories.families).create({ name: 'Mi familia', currency: 'COP' });
    const app = createFinanceApplication(family.id, database);
    await app.services.financialSettings.update({ currency: 'COP', locale: 'es-CO', weekStartsOn: 1 });
    if (input.income > 0) {
      const income = await app.services.incomes.create({ name: 'Ingreso mensual del hogar', amount: input.income, frequency: 'monthly', effectiveDate: date, isActive: true });
      await record(app, family.id, { kind: 'income', description: income.name, amount: income.amount, date, relatedEntityId: income.id });
    }
    for (const item of input.expenses) {
      const expense = await app.services.expenses.create({ name: item.name, amount: item.amount, dueDate: date, kind: 'fixed', categoryId: await categoryId(app, family.id, item.category) });
      await record(app, family.id, { kind: 'expense', description: expense.name, amount: expense.amount, date, relatedEntityId: expense.id, details: { categoryName: item.category, repeatMonthly: true } });
    }
    for (const debt of input.debts) await app.services.debts.create(debt);
    const preview = previewOnboarding(input, date);
    const timestamp = currentTimestamp();
    await app.repositories.budgets.save(monthlyBudgetSchema.parse({
      id: createId(), familyId: family.id, month: date.slice(0, 7), plannedIncome: preview.income,
      plannedFixedExpenses: preview.fixedExpenses, plannedVariableExpenses: 0,
      plannedDebtPayments: preview.debtPayments, plannedSavings: input.savings,
      createdAt: timestamp, updatedAt: timestamp,
    }));
    return family;
  });
}

// Fixed expenses recur only through the current month when the app is opened.
// The original day is retained (31 -> Feb 28 -> Mar 31); generated charges are pending.
export async function materializeRecurringExpenses(app: FinanceApplication, familyId: string, today = localDate()) {
  await app.database.transaction('rw', app.database.tables, async () => {
    const movements = (await app.repositories.transactions.list()).filter(item => item.familyId === familyId);
    const originals = movements.filter(item => item.kind === 'expense' && item.details?.repeatMonthly && !item.details.recurrenceSourceId);
    for (const original of originals) {
      if (!original.relatedEntityId) continue;
      const source = await app.repositories.expenses.get(original.relatedEntityId);
      if (!source || source.familyId !== familyId) continue;
      for (let month = addMonthsToMonth(original.date.slice(0, 7), 1); month <= today.slice(0, 7); month = addMonthsToMonth(month, 1)) {
        if (movements.some(item => item.details?.recurrenceSourceId === original.id && item.date.startsWith(month))) continue;
        const day = Math.min(Number(original.date.slice(8)), Number(monthRange(month).end.slice(8)));
        const date = `${month}-${String(day).padStart(2, '0')}`;
        const expense = await app.services.expenses.create({ name: source.name, amount: source.amount, kind: source.kind, dueDate: date, ...(source.categoryId ? { categoryId: source.categoryId } : {}) });
        const movement = await record(app, familyId, { kind: 'expense', description: expense.name, amount: expense.amount, date, relatedEntityId: expense.id, details: { ...original.details, repeatMonthly: false, recurrenceSourceId: original.id } });
        movements.push(movement);
      }
    }
  });
}

export async function loadWorkspace(app: FinanceApplication, familyId: string) {
  const [incomes, expenses, debts, categories, debtPayments, savingsGoals, savingsTransactions, transactions, budgets, settings] = await Promise.all([
    app.services.incomes.list(), app.services.expenses.list(), app.services.debts.list(), app.repositories.expenseCategories.list(), app.repositories.debtPayments.list(), app.services.savings.listGoals(), app.repositories.savingsTransactions.list(), app.repositories.transactions.list(), app.repositories.budgets.list(), app.services.financialSettings.get(),
  ]);
  const own = <T extends { familyId: string }>(items: T[]) => items.filter(item => item.familyId === familyId);
  return { incomes, expenses, debts, expenseCategories: own(categories), debtPayments: own(debtPayments), savingsGoals, savingsTransactions: own(savingsTransactions), transactions: own(transactions), budgets: own(budgets), settings };
}
export type WorkspaceData = Awaited<ReturnType<typeof loadWorkspace>>;
