import type { FinanceApplication, WorkspaceData } from './financeWorkspace';
import { localDate } from './financeWorkspace';
import { addMonthsToMonth } from '../../shared/utils/dates';
import type { DebtPlanStrategy } from '../../features/debt-plan/services/DebtPlanner';
import { errorMessage } from '../../shared/utils/presentation';

export function debtOverview(
  data: WorkspaceData,
  calculators: FinanceApplication['calculators'],
  today = localDate(),
) {
  const input = { ...data, month: today.slice(0, 7), asOfDate: today };
  const summary = calculators.financialSummary.calculate(input);
  return {
    total: summary.totalDebt,
    progress: summary.debtProgress,
    activeCount: data.debts.filter((debt) => debt.remainingBalance > 0).length,
    cards: data.debts.map((debt) => ({
      debt,
      progress: calculators.financialSummary.calculate({ ...input, debts: [debt] }).debtProgress,
      nextPayment: summary.upcomingPayments.find(
        (payment) => payment.kind === 'debt' && payment.id === debt.id,
      )?.dueDate,
      payments: data.debtPayments
        .filter((payment) => payment.debtId === debt.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    })),
  };
}

export function normalizeDebtOrder(ids: readonly string[], debts: WorkspaceData['debts']) {
  const active = debts.filter((debt) => debt.remainingBalance > 0).map((debt) => debt.id);
  return [...new Set([...ids.filter((id) => active.includes(id)), ...active])];
}

export function debtPlanView(
  data: WorkspaceData,
  calculators: FinanceApplication['calculators'],
  strategy: DebtPlanStrategy = data.settings?.debtPlan?.strategy ?? 'snowball',
  ids = data.settings?.debtPlan?.customOrder ?? [],
  today = localDate(),
) {
  const debts = data.debts.filter((debt) => debt.remainingBalance > 0);
  const customOrder = normalizeDebtOrder(ids, data.debts);
  const startMonth = addMonthsToMonth(today.slice(0, 7), 1);
  try {
    const plan = calculators.debtPlan.calculate({
      debts,
      strategy,
      customOrder,
      extraMonthlyPayment: 0,
      startMonth,
    });
    return {
      plan,
      error: '',
      customOrder,
      startMonth,
      timeline: plan.monthlyProjection.map((month) => ({
        ...month,
        priorityId: plan.priorityOrder.find((id) =>
          month.payments.some((payment) => payment.debtId === id && payment.startingBalance > 0),
        ),
        settled: month.payments
          .filter((payment) => payment.startingBalance > 0 && payment.remainingBalance === 0)
          .map((payment) => payment.debtId),
      })),
    };
  } catch (error) {
    return { plan: null, error: errorMessage(error), customOrder, startMonth, timeline: [] };
  }
}
