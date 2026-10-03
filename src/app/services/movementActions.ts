import { z } from 'zod';
import type { FinancialTransaction } from '../../domain/models/financial';
import type {
  FinanceRepositories,
  TransactionRunner,
} from '../../domain/ports/financeRepositories';
import type { IncomeService } from '../../features/income/services/IncomeService';
import type { ExpenseService } from '../../features/transactions/services/ExpenseService';
import { currentTimestamp } from '../../shared/utils/dates';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.number().finite().positive().max(Number.MAX_SAFE_INTEGER),
  date: z.iso.date(),
});
export function movementActions(
  repositories: FinanceRepositories,
  runner: TransactionRunner,
  familyId: string,
  incomes: IncomeService,
  expenses: ExpenseService,
) {
  return {
    async change(movement: FinancialTransaction, raw: z.input<typeof patchSchema> | null) {
      if (
        movement.familyId !== familyId ||
        !movement.relatedEntityId ||
        !['income', 'expense'].includes(movement.kind)
      )
        throw new Error('Este movimiento se gestiona desde su deuda o meta.');
      const patch = raw === null ? null : patchSchema.parse(raw);
      const id = movement.relatedEntityId;
      await runner.run(['incomes', 'expenses', 'transactions'], async () => {
        if (movement.kind === 'income') {
          if (patch)
            await incomes.update(id, {
              name: patch.name,
              amount: patch.amount,
              effectiveDate: patch.date,
            });
          else await incomes.delete(id);
        } else {
          if (patch) {
            const original = await expenses.get(id);
            await expenses.update(id, {
              name: patch.name,
              amount: patch.amount,
              ...(!original.paidAt ? { dueDate: patch.date } : {}),
            });
            if (original.paidAt) await expenses.markAsPaid(id, `${patch.date}T12:00:00.000Z`);
          } else await expenses.delete(id);
        }
        const linked = (await repositories.transactions.list()).filter(
          (item) =>
            item.familyId === familyId &&
            item.kind === movement.kind &&
            item.relatedEntityId === id,
        );
        for (const item of linked) {
          if (patch)
            await repositories.transactions.save({
              ...item,
              description: patch.name,
              amount: patch.amount,
              date: patch.date,
              updatedAt: currentTimestamp(),
            });
          else await repositories.transactions.delete(item.id);
        }
      });
    },
  };
}
