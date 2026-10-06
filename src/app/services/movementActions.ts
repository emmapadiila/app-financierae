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
import { currentMonth, currentTimestamp } from '../../shared/utils/dates';
import {
  occurrenceMonth,
  recurrenceBase,
  recurrenceDate,
  type RecurrenceScope,
} from '../../domain/models/recurrence';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: z.number().finite().positive().max(Number.MAX_SAFE_INTEGER),
  date: z.iso.date(),
  recurrenceDay: z.number().int().min(1).max(31).optional(),
});
export function movementActions(
  repositories: FinanceRepositories,
  runner: TransactionRunner,
  familyId: string,
  incomes: IncomeService,
  expenses: ExpenseService,
) {
  return {
    async change(
      movement: FinancialTransaction,
      raw: z.input<typeof patchSchema> | null,
      scope: RecurrenceScope = 'single',
    ) {
      z.enum(['single', 'following', 'all']).parse(scope);
      if (
        movement.familyId !== familyId ||
        !movement.relatedEntityId ||
        !['income', 'expense'].includes(movement.kind)
      )
        throw new Error('Este movimiento se gestiona desde su deuda o meta.');
      const patch = raw === null ? null : patchSchema.parse(raw);
      const id = movement.relatedEntityId;
      await runner.run(['incomes', 'expenses', 'transactions'], async () => {
        const ledger = await repositories.transactions.list();
        const persisted = ledger.find((item) => item.id === movement.id);
        if (
          persisted &&
          (persisted.familyId !== familyId ||
            persisted.relatedEntityId !== id ||
            persisted.kind !== movement.kind)
        )
          throw new Error('El movimiento cambió o ya no existe. Vuelve a abrirlo.');
        const linked = ledger.filter(
          (item) =>
            item.familyId === familyId &&
            item.kind === movement.kind &&
            item.relatedEntityId === id,
        );
        // Legacy ordinary records are displayed through a read adapter without a ledger row.
        if (!persisted && (scope !== 'single' || movement.id !== id || linked.length > 0))
          throw new Error('El movimiento cambió o ya no existe. Vuelve a abrirlo.');
        if (scope !== 'single') {
          if (!persisted || persisted.kind !== 'expense')
            throw new Error('Este movimiento no es una serie de gastos.');
          const sourceId = persisted.details?.recurrenceSourceId ?? persisted.id;
          const source = await repositories.transactions.get(sourceId);
          if (
            !source ||
            source.familyId !== familyId ||
            source.kind !== 'expense' ||
            !source.details?.repeatMonthly ||
            source.details.recurrenceSourceId ||
            !source.relatedEntityId
          )
            throw new Error('La serie recurrente ya no está disponible.');
          const origin = await expenses.get(source.relatedEntityId);
          const selected = await expenses.get(id);
          const base = recurrenceBase(source, origin);
          // "All" changes the rule from the current month; never rewrite past finances.
          const fromMonth =
            scope === 'following' ? occurrenceMonth(persisted, selected) : currentMonth();
          const effectiveMonth = fromMonth < base.startMonth ? base.startMonth : fromMonth;
          if (
            patch &&
            source.details.recurrenceStoppedFrom &&
            effectiveMonth >= source.details.recurrenceStoppedFrom
          )
            throw new Error(
              'Esta serie está finalizada en ese período. No se reactivará al editarla.',
            );
          const day = patch?.recurrenceDay ?? Number(patch?.date.slice(8));
          const details = { ...source.details, recurrenceBase: base };
          if (patch) {
            // Replace the rule from this period onward; retain every earlier revision.
            details.recurrenceChanges = [
              ...(details.recurrenceChanges ?? []).filter(
                (change) => change.fromMonth < effectiveMonth,
              ),
              { fromMonth: effectiveMonth, name: patch.name, amount: patch.amount, day },
            ];
          } else {
            details.recurrenceStoppedFrom =
              details.recurrenceStoppedFrom && details.recurrenceStoppedFrom < effectiveMonth
                ? details.recurrenceStoppedFrom
                : effectiveMonth;
          }
          await repositories.transactions.save(
            financialTransactionSchema.parse({ ...source, details, updatedAt: currentTimestamp() }),
          );
          const handled = new Set<string>();
          for (const item of ledger) {
            if (
              item.familyId !== familyId ||
              item.kind !== 'expense' ||
              item.details?.recurrenceSourceId !== source.id ||
              !item.relatedEntityId ||
              handled.has(item.relatedEntityId)
            )
              continue;
            const expense = await expenses.get(item.relatedEntityId);
            const month = occurrenceMonth(item, expense);
            if (month < effectiveMonth || expense.paidAt) continue;
            handled.add(expense.id);
            const related = ledger.filter(
              (entry) =>
                entry.familyId === familyId &&
                entry.kind === 'expense' &&
                entry.relatedEntityId === expense.id,
            );
            if (related.some((entry) => entry.details?.recurrenceSourceId !== source.id))
              throw new Error('El gasto tiene referencias recurrentes inconsistentes.');
            if (patch) {
              const date = recurrenceDate(month, day);
              await expenses.update(expense.id, {
                name: patch.name,
                amount: patch.amount,
                dueDate: date,
              });
              for (const entry of related)
                await repositories.transactions.save(
                  financialTransactionSchema.parse({
                    ...entry,
                    description: patch.name,
                    amount: patch.amount,
                    date,
                    details: { ...entry.details, recurrenceMonth: month },
                    updatedAt: currentTimestamp(),
                  }),
                );
            } else {
              await expenses.delete(expense.id);
              for (const entry of related) await repositories.transactions.delete(entry.id);
            }
          }
          return;
        }
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
            // Freeze a legacy origin's rule before editing its historical expense.
            for (const item of linked) {
              if (
                item.details?.repeatMonthly &&
                !item.details.recurrenceSourceId &&
                !item.details.recurrenceBase
              )
                item.details = { ...item.details, recurrenceBase: recurrenceBase(item, original) };
              if (item.details?.recurrenceSourceId)
                item.details = {
                  ...item.details,
                  recurrenceMonth: occurrenceMonth(item, original),
                };
            }
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
