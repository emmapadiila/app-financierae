import { z } from 'zod';
import type { Debt } from '../../../domain/models/financial';
import {
  DebtPlanner,
  type DebtPlanMonth,
  type DebtPlanStrategy,
} from '../../debt-plan/services/DebtPlanner';

export interface DebtSimulatorInput {
  debts: readonly Pick<
    Debt,
    'id' | 'name' | 'remainingBalance' | 'annualInterestRate' | 'minimumPayment'
  >[];
  monthlyIncome: number;
  monthlyExpenses: number;
  currentExtraDebtPayment: number;
  changes: {
    incomeIncrease: number;
    expenseReduction: number;
    debtPaymentIncrease: number;
  };
  strategy: DebtPlanStrategy;
  startMonth: string;
  customOrder?: readonly string[];
}

export interface DebtSimulatorScenario {
  estimatedMonths: number;
  estimatedDate: string | null;
  monthlyEvolution: DebtPlanMonth[];
  extraDebtPayment: number;
}

export interface DebtSimulatorResult {
  current: DebtSimulatorScenario;
  simulated: DebtSimulatorScenario;
  monthsDifference: number;
  disclaimer: string;
}

const simulatorInputSchema = z.object({
  debts: z.array(
    z.object({
      id: z.uuid(),
      name: z.string().min(1),
      remainingBalance: z.number().finite().nonnegative(),
      annualInterestRate: z.number().finite().nonnegative(),
      minimumPayment: z.number().finite().nonnegative(),
    }),
  ),
  monthlyIncome: z.number().finite().nonnegative(),
  monthlyExpenses: z.number().finite().nonnegative(),
  currentExtraDebtPayment: z.number().finite().nonnegative(),
  changes: z.object({
    incomeIncrease: z.number().finite().nonnegative(),
    expenseReduction: z.number().finite().nonnegative(),
    debtPaymentIncrease: z.number().finite().nonnegative(),
  }),
  strategy: z.enum(['snowball', 'avalanche', 'custom']),
  startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  customOrder: z.array(z.uuid()).optional(),
});

function scenarioFromPlan(
  plan: ReturnType<DebtPlanner['calculate']>,
  extraDebtPayment: number,
): DebtSimulatorScenario {
  return {
    estimatedMonths: plan.estimatedMonths,
    estimatedDate: plan.estimatedDebtFreeMonth,
    monthlyEvolution: plan.monthlyProjection,
    extraDebtPayment,
  };
}

export class DebtSimulator {
  constructor(private readonly debtPlanner = new DebtPlanner()) {}

  simulate(input: DebtSimulatorInput): DebtSimulatorResult {
    const data = simulatorInputSchema.parse(input);
    const minimumPayments = data.debts.reduce((total, debt) => total + debt.minimumPayment, 0);
    const currentExtra = data.currentExtraDebtPayment;
    const availableAfterChanges = Math.max(
      0,
      data.monthlyIncome + data.changes.incomeIncrease - data.monthlyExpenses + data.changes.expenseReduction,
    );
    const simulatedExtra = Math.max(
      0,
      Math.min(
        currentExtra +
          data.changes.incomeIncrease +
          data.changes.expenseReduction +
          data.changes.debtPaymentIncrease,
        Math.max(0, availableAfterChanges - minimumPayments),
      ),
    );
    const planInput = {
      debts: data.debts,
      strategy: data.strategy,
      startMonth: data.startMonth,
      ...(data.strategy === 'custom' && data.customOrder ? { customOrder: data.customOrder } : {}),
    };
    const currentPlan = this.debtPlanner.calculate({ ...planInput, extraMonthlyPayment: currentExtra });
    const simulatedPlan = this.debtPlanner.calculate({ ...planInput, extraMonthlyPayment: simulatedExtra });

    return {
      current: scenarioFromPlan(currentPlan, currentExtra),
      simulated: scenarioFromPlan(simulatedPlan, simulatedExtra),
      monthsDifference: currentPlan.estimatedMonths - simulatedPlan.estimatedMonths,
      disclaimer: 'Escenarios orientativos; los resultados reales pueden variar.',
    };
  }
}