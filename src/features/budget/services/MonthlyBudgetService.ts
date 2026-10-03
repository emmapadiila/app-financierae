import { monthlyBudgetSchema, type MonthlyBudget } from '../../../domain/models/financial';
import type {
  EntityRepository,
  TransactionRunner,
} from '../../../domain/ports/financeRepositories';
import { createId } from '../../../shared/utils/ids';
import { currentTimestamp } from '../../../shared/utils/dates';
const inputSchema = monthlyBudgetSchema.omit({
  id: true,
  familyId: true,
  createdAt: true,
  updatedAt: true,
});
export type BudgetDraft = Omit<MonthlyBudget, 'id' | 'familyId' | 'createdAt' | 'updatedAt'>;
export class MonthlyBudgetService {
  constructor(
    private readonly repository: EntityRepository<MonthlyBudget>,
    private readonly runner: TransactionRunner,
    private readonly familyId: string,
  ) {}
  async save(input: BudgetDraft) {
    const draft = inputSchema.parse(input);
    return this.runner.run(['budgets'], async () => {
      const previous = (await this.repository.list()).find(
        (item) => item.familyId === this.familyId && item.month === draft.month,
      );
      const now = currentTimestamp();
      const budget = monthlyBudgetSchema.parse({
        ...draft,
        id: previous?.id ?? createId(),
        familyId: this.familyId,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      });
      await this.repository.save(budget);
      return budget;
    });
  }
}
