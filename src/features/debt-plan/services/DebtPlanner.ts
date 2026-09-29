import { z } from 'zod';
import type { Debt } from '../../../domain/models/financial';
import { addMonthsToMonth } from '../../../shared/utils/dates';
import { PlanningError } from '../../../shared/utils/serviceErrors';

export type DebtPlanStrategy = 'snowball' | 'avalanche' | 'custom';

export interface DebtPlanInput {
  debts: readonly Pick<
    Debt,
    'id' | 'name' | 'remainingBalance' | 'annualInterestRate' | 'minimumPayment'
  >[];
  strategy: DebtPlanStrategy;
  extraMonthlyPayment: number;
  startMonth: string;
  customOrder?: readonly string[];
  maxMonths?: number;
}

export interface DebtPlanPayment {
  debtId: string;
  startingBalance: number;
  interest: number;
  payment: number;
  remainingBalance: number;
}

export interface DebtPlanMonth {
  month: string;
  totalPayment: number;
  totalInterest: number;
  remainingDebt: number;
  payments: DebtPlanPayment[];
}

export interface DebtPlanResult {
  strategy: DebtPlanStrategy;
  estimatedMonths: number;
  estimatedDebtFreeMonth: string | null;
  totalInterest: number;
  monthlyProjection: DebtPlanMonth[];
  disclaimer: string;
}

const debtPlanInputSchema = z.object({
  debts: z.array(
    z.object({
      id: z.uuid(),
      name: z.string().min(1),
      remainingBalance: z.number().finite().nonnegative(),
      annualInterestRate: z.number().finite().nonnegative().max(1000),
      minimumPayment: z.number().finite().nonnegative(),
    }),
  ),
  strategy: z.enum(['snowball', 'avalanche', 'custom']),
  extraMonthlyPayment: z.number().finite().nonnegative(),
  startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  customOrder: z.array(z.uuid()).optional(),
  maxMonths: z.number().int().positive().max(1200).optional(),
});

const roundMoney = (amount: number): number => Math.round((amount + Number.EPSILON) * 100) / 100;

function sortDebts(
  debts: DebtPlanInput['debts'],
  strategy: DebtPlanStrategy,
  customOrder: readonly string[] | undefined,
): DebtPlanInput['debts'][number][] {
  const originalPosition = new Map(debts.map((debt, index) => [debt.id, index]));

  if (strategy === 'snowball') {
    return [...debts].sort(
      (left, right) =>
        left.remainingBalance - right.remainingBalance ||
        (originalPosition.get(left.id) ?? 0) - (originalPosition.get(right.id) ?? 0),
    );
  }
  if (strategy === 'avalanche') {
    return [...debts].sort(
      (left, right) =>
        right.annualInterestRate - left.annualInterestRate ||
        left.remainingBalance - right.remainingBalance ||
        (originalPosition.get(left.id) ?? 0) - (originalPosition.get(right.id) ?? 0),
    );
  }

  const ids = customOrder ?? [];
  if (ids.length !== debts.length || new Set(ids).size !== ids.length || ids.some((id) => !originalPosition.has(id))) {
    throw new PlanningError('El orden personalizado debe incluir cada deuda exactamente una vez.');
  }
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...debts].sort((left, right) => (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0));
}

export class DebtPlanner {
  calculate(input: DebtPlanInput): DebtPlanResult {
    const data = debtPlanInputSchema.parse(input);
    const debts = data.debts.filter((debt) => debt.remainingBalance > 0);
    const maxMonths = data.maxMonths ?? 600;
    const order = sortDebts(debts, data.strategy, data.customOrder);
    const balances = new Map(debts.map((debt) => [debt.id, debt.remainingBalance]));
    const monthlyPaymentBudget =
      debts.reduce((total, debt) => total + debt.minimumPayment, 0) + data.extraMonthlyPayment;
    const monthlyProjection: DebtPlanMonth[] = [];
    let totalInterest = 0;

    if (debts.length === 0) {
      return {
        strategy: data.strategy,
        estimatedMonths: 0,
        estimatedDebtFreeMonth: null,
        totalInterest: 0,
        monthlyProjection,
        disclaimer: 'Proyección informativa; no constituye una garantía de resultados.',
      };
    }

    for (let monthIndex = 0; monthIndex < maxMonths; monthIndex += 1) {
      const month = addMonthsToMonth(data.startMonth, monthIndex);
      const startingBalances = new Map(balances);
      const interestByDebt = new Map<string, number>();
      const paymentsByDebt = new Map<string, number>();
      let monthInterest = 0;

      for (const debt of debts) {
        const balance = balances.get(debt.id) ?? 0;
        if (balance === 0) continue;
        const interest = roundMoney((balance * debt.annualInterestRate) / 1200);
        balances.set(debt.id, roundMoney(balance + interest));
        interestByDebt.set(debt.id, interest);
        monthInterest += interest;
      }

      let remainingBudget = monthlyPaymentBudget;
      for (const debt of debts) {
        const balance = balances.get(debt.id) ?? 0;
        if (balance === 0) continue;
        const payment = roundMoney(Math.min(balance, debt.minimumPayment, remainingBudget));
        balances.set(debt.id, roundMoney(balance - payment));
        paymentsByDebt.set(debt.id, payment);
        remainingBudget = roundMoney(remainingBudget - payment);
      }

      for (const debt of order) {
        const balance = balances.get(debt.id) ?? 0;
        if (balance === 0 || remainingBudget <= 0) continue;
        const extraPayment = roundMoney(Math.min(balance, remainingBudget));
        balances.set(debt.id, roundMoney(balance - extraPayment));
        paymentsByDebt.set(debt.id, roundMoney((paymentsByDebt.get(debt.id) ?? 0) + extraPayment));
        remainingBudget = roundMoney(remainingBudget - extraPayment);
      }

      const payments = debts.map((debt) => ({
        debtId: debt.id,
        startingBalance: startingBalances.get(debt.id) ?? 0,
        interest: interestByDebt.get(debt.id) ?? 0,
        payment: paymentsByDebt.get(debt.id) ?? 0,
        remainingBalance: balances.get(debt.id) ?? 0,
      }));
      const monthPayment = roundMoney(payments.reduce((total, payment) => total + payment.payment, 0));
      const remainingDebt = roundMoney([...balances.values()].reduce((total, balance) => total + balance, 0));
      const madeProgress = payments.some((payment) => payment.remainingBalance < payment.startingBalance);

      if (!madeProgress) {
        throw new PlanningError(
          'El pago mensual no alcanza para reducir el saldo de las deudas con los intereses actuales.',
        );
      }

      totalInterest = roundMoney(totalInterest + monthInterest);
      monthlyProjection.push({
        month,
        totalPayment: monthPayment,
        totalInterest: roundMoney(monthInterest),
        remainingDebt,
        payments,
      });

      if (remainingDebt === 0) {
        return {
          strategy: data.strategy,
          estimatedMonths: monthlyProjection.length,
          estimatedDebtFreeMonth: month,
          totalInterest,
          monthlyProjection,
          disclaimer: 'Proyección informativa; no constituye una garantía de resultados.',
        };
      }
    }

    throw new PlanningError(`La proyección supera el límite de ${maxMonths} meses.`);
  }
}