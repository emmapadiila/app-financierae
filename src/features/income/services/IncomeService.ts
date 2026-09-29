import { z } from 'zod';
import { incomeSchema, type Income } from '../../../domain/models/financial';
import type { EntityRepository } from '../../../domain/ports/financeRepositories';
import { currentTimestamp, monthRange } from '../../../shared/utils/dates';
import { createId } from '../../../shared/utils/ids';
import { EntityNotFoundError } from '../../../shared/utils/serviceErrors';

const incomeCreateSchema = z.object(incomeSchema.shape).strict().omit({
  id: true,
  familyId: true,
  createdAt: true,
  updatedAt: true,
});

const incomePatchSchema = incomeCreateSchema.partial().strict();
export type CreateIncomeInput = z.input<typeof incomeCreateSchema>;
export type UpdateIncomeInput = z.input<typeof incomePatchSchema>;

export function incomesForMonth(incomes: readonly Income[], month: string): Income[] {
  const { start, end } = monthRange(month);
  return incomes.filter((income) => {
    if (
      !income.isActive ||
      income.effectiveDate > end ||
      (income.endDate && income.endDate < start)
    ) {
      return false;
    }
    return income.frequency !== 'occasional' || income.effectiveDate >= start;
  });
}

export function calculateMonthlyIncomeTotal(incomes: readonly Income[], month: string): number {
  return incomesForMonth(incomes, month).reduce((total, income) => {
    switch (income.frequency) {
      case 'monthly':
        return total + income.amount;
      case 'biweekly':
        return total + (income.amount * 26) / 12;
      case 'weekly':
        return total + (income.amount * 52) / 12;
      case 'occasional':
        return total + income.amount;
    }
  }, 0);
}

export interface ServiceOptions {
  idFactory?: () => string;
  now?: () => string;
}

export class IncomeService {
  private readonly idFactory: () => string;
  private readonly now: () => string;

  constructor(
    private readonly repository: EntityRepository<Income>,
    private readonly familyId: string,
    options: ServiceOptions = {},
  ) {
    this.idFactory = options.idFactory ?? createId;
    this.now = options.now ?? currentTimestamp;
  }

  async create(input: CreateIncomeInput): Promise<Income> {
    const data = incomeCreateSchema.parse(input);
    const timestamp = this.now();
    const income = incomeSchema.parse({
      ...data,
      id: this.idFactory(),
      familyId: this.familyId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.repository.save(income);
    return income;
  }

  async list(): Promise<Income[]> {
    return (await this.repository.list()).filter((income) => income.familyId === this.familyId);
  }

  async get(id: string): Promise<Income> {
    const income = await this.repository.get(id);
    if (!income || income.familyId !== this.familyId) throw new EntityNotFoundError('Ingreso', id);
    return income;
  }

  async update(id: string, patch: UpdateIncomeInput): Promise<Income> {
    const existing = await this.get(id);
    const data = incomePatchSchema.parse(patch);
    const updated = incomeSchema.parse({ ...existing, ...data, updatedAt: this.now() });
    await this.repository.save(updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    await this.repository.delete(id);
  }

  async getForMonth(month: string): Promise<Income[]> {
    return incomesForMonth(await this.list(), month);
  }

  async getMonthlyTotal(month: string): Promise<number> {
    return calculateMonthlyIncomeTotal(await this.list(), month);
  }
}
