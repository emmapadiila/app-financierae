import { z } from 'zod';
import { financialTransactionSchema } from '../../domain/models/financial';
import { occurrenceMonth, recurrenceBase } from '../../domain/models/recurrence';
import type { FinanceRepositories, TransactionRunner } from '../../domain/ports/financeRepositories';
import type { ExpenseService } from '../../features/transactions/services/ExpenseService';
import { currentMonth, currentTimestamp } from '../../shared/utils/dates';

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const actionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pause'), fromMonth: month }).strict(),
  z.object({ kind: z.literal('resume'), fromMonth: month }).strict(),
  z.object({ kind: z.literal('end'), endMonth: month.nullable() }).strict(),
]);
export type RecurrenceAction = z.input<typeof actionSchema>;

export function recurrenceActions(repositories: FinanceRepositories, runner: TransactionRunner, familyId: string, expenses: ExpenseService) {
  return {
    async change(sourceId: string, raw: RecurrenceAction): Promise<void> {
      const action = actionSchema.parse(raw);
      await runner.run(['expenses', 'transactions'], async () => {
        const source = await repositories.transactions.get(sourceId);
        if (!source || source.familyId !== familyId || source.kind !== 'expense' || !source.details?.repeatMonthly || source.details.recurrenceSourceId || !source.relatedEntityId)
          throw new Error('La serie recurrente no pertenece a este hogar o ya no existe.');
        if (source.details.recurrenceStoppedFrom)
          throw new Error('Esta serie fue cancelada. Reactivar o cambiar su final no puede restaurarla.');
        const origin = await expenses.get(source.relatedEntityId);
        const details = { ...source.details, recurrenceBase: recurrenceBase(source, origin) };
        const today = currentMonth();
        const ranges = (details.recurrencePauses ?? []).map(range => ({ ...range }));
        const last = ranges.at(-1);
        let removeFrom: string | undefined;
        if (action.kind === 'end') {
          if (action.endMonth !== null && action.endMonth < details.recurrenceBase.startMonth)
            throw new Error('El mes final no puede ser anterior al inicio de la serie.');
          if (action.endMonth === null) delete details.recurrenceEndMonth;
          else details.recurrenceEndMonth = action.endMonth;
        } else {
          if (action.fromMonth < today || action.fromMonth < details.recurrenceBase.startMonth)
            throw new Error('Elige el mes actual o uno posterior al inicio de la serie.');
          if (details.recurrenceEndMonth && action.fromMonth > details.recurrenceEndMonth)
            throw new Error('Ese período supera el mes final. Cambia el final antes de continuar.');
          if (action.kind === 'pause') {
            if (last && !last.resumeMonth) throw new Error('La serie ya tiene una pausa abierta.');
            if (last?.resumeMonth && action.fromMonth < last.resumeMonth)
              throw new Error('La nueva pausa no puede solaparse con una pausa anterior.');
            ranges.push({ fromMonth: action.fromMonth });
            removeFrom = action.fromMonth;
          } else {
            if (!last || last.resumeMonth) throw new Error('La serie no tiene una pausa abierta.');
            if (action.fromMonth < last.fromMonth) throw new Error('No puedes reactivar antes del inicio de la pausa.');
            last.resumeMonth = action.fromMonth;
          }
          details.recurrencePauses = ranges;
        }
        await repositories.transactions.save(financialTransactionSchema.parse({ ...source, details, updatedAt: currentTimestamp() }));
        if (action.kind === 'resume' || (action.kind === 'end' && action.endMonth === null)) return;
        const ledger = await repositories.transactions.list();
        const handled = new Set<string>();
        for (const item of ledger) {
          if (item.familyId !== familyId || item.kind !== 'expense' || item.details?.recurrenceSourceId !== source.id || !item.relatedEntityId || handled.has(item.relatedEntityId)) continue;
          const expense = await expenses.get(item.relatedEntityId);
          const period = occurrenceMonth(item, expense);
          const excluded = action.kind === 'pause' ? period >= removeFrom! : period > action.endMonth!;
          // The original and all paid/past expenses remain historical records.
          if (!excluded || period < today || expense.paidAt) continue;
          handled.add(expense.id);
          const linked = ledger.filter(entry => entry.familyId === familyId && entry.kind === 'expense' && entry.relatedEntityId === expense.id);
          if (linked.some(entry => entry.details?.recurrenceSourceId !== source.id)) throw new Error('El gasto tiene referencias recurrentes inconsistentes.');
          await expenses.delete(expense.id);
          for (const entry of linked) await repositories.transactions.delete(entry.id);
        }
      });
    },
  };
}
