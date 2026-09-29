import { z } from 'zod';
import { expenseSchema, type Expense } from '../../../domain/models/financial';
import type { EntityRepository } from '../../../domain/ports/financeRepositories';
import { currentTimestamp, monthRange } from '../../../shared/utils/dates';
import { createId } from '../../../shared/utils/ids';
import { EntityNotFoundError } from '../../../shared/utils/serviceErrors';

const expenseCreateSchema = expenseSchema.omit({
  id: true,
  familyId: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
});
const expensePatchSchema = expenseCreateSchema.partial().strict();

export type CreateExpenseInput = z.input<typeof expenseCreateSchema>;
export type UpdateExpenseInput = z.input<typeof expensePatchSchema>;

export function calculateExpenseTotals(expenses: readonly Expense[]): {
  fixed: number;
  variable: number;
  total: number;
} {
  const fixed = expenses
    .filter((expense) => expense.kind === 'fixed')
    .reduce((total, expense) => total + expense.amount, 0);
  const variable = expenses
    .filter((expense) => expense.kind === 'variable')
    .reduce((total, expense) => total + expense.amount, 0);
  return { fixed, variable, total: fixed + variable };
}

export interface ExpenseServiceOptions {
  idFactory?: () => string;
  now?: () => string;
}

export class ExpenseService {
  private readonly idFactory: () => string;
  private readonly now: () => string;

  constructor(
    private readonly repository: EntityRepository<Expense>,
    private readonly familyId: string,
    options: ExpenseServiceOptions = {},
  ) {
    this.idFactory = options.idFactory ?? createId;
    this.now = options.now ?? currentTimestamp;
  }

  async create(input: CreateExpenseInput): Promise<Expense> {
    const data = expenseCreateSchema.parse(input);
    const timestamp = this.now();
    const expense = expenseSchema.parse({
      ...data,
      id: this.idFactory(),
      familyId: this.familyId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.repository.save(expense);
    return expense;
  }

  async list(): Promise<Expense[]> {
    return (await this.repository.list()).filter((expense) => expense.familyId === this.familyId);
  }

  async get(id: string): Promise<Expense> {
    const expense = await this.repository.get(id);
    if (!expense || expense.familyId !== this.familyId) throw new EntityNotFoundError('Gasto', id);
    return expense;
  }

  async update(id: string, patch: UpdateExpenseInput): Promise<Expense> {
    const existing = await this.get(id);
    const data = expensePatchSchema.parse(patch);
    const updated = expenseSchema.parse({ ...existing, ...data, updatedAt: this.now() });
    await this.repository.save(updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    await this.repository.delete(id);
  }

  async markAsPaid(id: string, paidAt = this.now()): Promise<Expense> {
    const expense = await this.get(id);
    const updated = expenseSchema.parse({ ...expense, paidAt, updatedAt: this.now() });
    await this.repository.save(updated);
    return updated;
  }

  async getForMonth(month: string): Promise<Expense[]> {
    const { start, end } = monthRange(month);
    return (await this.list()).filter((expense) => expense.dueDate >= start && expense.dueDate <= end);
  }

  async getPending(today = new Date().toISOString().slice(0, 10)): Promise<Expense[]> {
    return (await this.list()).filter((expense) => !expense.paidAt && expense.dueDate >= today);
  }

  async getOverdue(today = new Date().toISOString().slice(0, 10)): Promise<Expense[]> {
    return (await this.list()).filter((expense) => !expense.paidAt && expense.dueDate < today);
  }

  async getTotalsForMonth(month: string): Promise<ReturnType<typeof calculateExpenseTotals>> {
    return calculateExpenseTotals(await this.getForMonth(month));
  }
}