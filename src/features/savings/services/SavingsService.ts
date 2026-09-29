import { z } from 'zod';
import {
  savingsGoalSchema,
  savingsTransactionSchema,
  type SavingsGoal,
  type SavingsTransaction,
} from '../../../domain/models/financial';
import type {
  EntityRepository,
  TransactionRunner,
} from '../../../domain/ports/financeRepositories';
import { currentTimestamp } from '../../../shared/utils/dates';
import { createId } from '../../../shared/utils/ids';
import { EntityNotFoundError, InsufficientBalanceError } from '../../../shared/utils/serviceErrors';

const goalCreateSchema = savingsGoalSchema.omit({
  id: true,
  familyId: true,
  currentAmount: true,
  createdAt: true,
  updatedAt: true,
});
const goalPatchSchema = goalCreateSchema.partial().strict();
const savingsMovementSchema = z.object({
  amount: z.number().finite().positive().max(Number.MAX_SAFE_INTEGER),
  date: z.iso.date(),
  note: z.string().trim().max(500).optional(),
});

export type CreateSavingsGoalInput = z.input<typeof goalCreateSchema>;
export type UpdateSavingsGoalInput = z.input<typeof goalPatchSchema>;
export type SavingsMovementInput = z.input<typeof savingsMovementSchema>;

export interface SavingsServiceOptions {
  idFactory?: () => string;
  now?: () => string;
}

export class SavingsService {
  private readonly idFactory: () => string;
  private readonly now: () => string;

  constructor(
    private readonly goals: EntityRepository<SavingsGoal>,
    private readonly movements: EntityRepository<SavingsTransaction>,
    private readonly transactionRunner: TransactionRunner,
    private readonly familyId: string,
    options: SavingsServiceOptions = {},
  ) {
    this.idFactory = options.idFactory ?? createId;
    this.now = options.now ?? currentTimestamp;
  }

  async createGoal(input: CreateSavingsGoalInput): Promise<SavingsGoal> {
    const data = goalCreateSchema.parse(input);
    const timestamp = this.now();
    const goal = savingsGoalSchema.parse({
      ...data,
      id: this.idFactory(),
      familyId: this.familyId,
      currentAmount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.goals.save(goal);
    return goal;
  }

  async listGoals(): Promise<SavingsGoal[]> {
    return (await this.goals.list()).filter((goal) => goal.familyId === this.familyId);
  }

  async getGoal(id: string): Promise<SavingsGoal> {
    const goal = await this.goals.get(id);
    if (!goal || goal.familyId !== this.familyId) throw new EntityNotFoundError('Meta de ahorro', id);
    return goal;
  }

  async updateGoal(id: string, patch: UpdateSavingsGoalInput): Promise<SavingsGoal> {
    const goal = await this.getGoal(id);
    const data = goalPatchSchema.parse(patch);
    const updated = savingsGoalSchema.parse({ ...goal, ...data, updatedAt: this.now() });
    await this.goals.save(updated);
    return updated;
  }

  async deleteGoal(id: string): Promise<void> {
    await this.getGoal(id);
    await this.transactionRunner.run(['savingsGoals', 'savingsTransactions'], async () => {
      const related = (await this.movements.list()).filter((movement) => movement.goalId === id);
      await Promise.all(related.map((movement) => this.movements.delete(movement.id)));
      await this.goals.delete(id);
    });
  }

  async getHistory(goalId: string): Promise<SavingsTransaction[]> {
    await this.getGoal(goalId);
    return (await this.movements.list())
      .filter((movement) => movement.goalId === goalId)
      .sort((left, right) => right.date.localeCompare(left.date));
  }

  async contribute(goalId: string, input: SavingsMovementInput): Promise<SavingsGoal> {
    return this.applyMovement(goalId, input, 'contribution');
  }

  async withdraw(goalId: string, input: SavingsMovementInput): Promise<SavingsGoal> {
    return this.applyMovement(goalId, input, 'withdrawal');
  }

  private async applyMovement(
    goalId: string,
    input: SavingsMovementInput,
    kind: SavingsTransaction['kind'],
  ): Promise<SavingsGoal> {
    const data = savingsMovementSchema.parse(input);
    return this.transactionRunner.run(['savingsGoals', 'savingsTransactions'], async () => {
      const goal = await this.getGoal(goalId);
      if (kind === 'withdrawal' && data.amount > goal.currentAmount) {
        throw new InsufficientBalanceError('El retiro no puede superar el saldo de la meta.');
      }
      const transaction = savingsTransactionSchema.parse({
        ...data,
        id: this.idFactory(),
        familyId: this.familyId,
        goalId,
        kind,
        createdAt: this.now(),
      });
      const currentAmount =
        kind === 'contribution' ? goal.currentAmount + data.amount : goal.currentAmount - data.amount;
      const updated = savingsGoalSchema.parse({ ...goal, currentAmount, updatedAt: this.now() });
      await this.movements.save(transaction);
      await this.goals.save(updated);
      return updated;
    });
  }
}