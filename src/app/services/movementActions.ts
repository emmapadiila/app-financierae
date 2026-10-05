import { z } from 'zod';
import {
  financialTransactionSchema,
  type FinancialTransaction,
} from '../../domain/models/financial';
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
        const linked = (await repositories.transactions.list()).filter(
          (item) =>
            item.familyId === familyId &&
            item.kind === movement.kind &&
            item.relatedEntityId === id,
        );
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
          } else {
            const occurrence = await expenses.get(id);
            // Read persisted relationships, never trust the UI snapshot to identify a series.
            for (const item of linked) {
              const sourceId = item.details?.recurrenceSourceId;
              if (!sourceId) continue;
              const source = await repositories.transactions.get(sourceId);
              // Deleting the original series already stops generation; preserve that behavior.
              if (!source) continue;
              if (
                source.familyId !== familyId ||
                source.kind !== 'expense' ||
                !source.details?.repeatMonthly ||
                source.details.recurrenceSourceId
              )
                throw new Error(
                  'La ocurrencia no pertenece a una serie recurrente válida de este hogar.',
                );
              const month = item.details?.recurrenceMonth ?? occurrence.dueDate.slice(0, 7);
              await repositories.transactions.save(
                financialTransactionSchema.parse({
                  ...source,
                  details: {
                    ...source.details,
                    omittedMonths: [
                      ...new Set([...(source.details.omittedMonths ?? []), month]),
                    ].sort(),
                  },
                  updatedAt: currentTimestamp(),
                }),
              );
            }
            await expenses.delete(id);
          }
        }
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
