import { describe, expect, it } from 'vitest';
import { BudgetCalculator } from '../src/features/budget/services/BudgetCalculator';
import { DebtPlanner } from '../src/features/debt-plan/services/DebtPlanner';
import { FinancialSummaryCalculator } from '../src/features/dashboard/services/FinancialSummaryCalculator';
import { SavingsCalculator } from '../src/features/savings/services/SavingsCalculator';
import { DebtSimulator } from '../src/features/simulator/services/DebtSimulator';
import { calculateMonthlyIncomeTotal } from '../src/features/income/services/IncomeService';
import { mockDebt, mockExpense, mockIncome, mockSavingsGoal } from './fixtures/mockFinanceData';

const debtA = '00000000-0000-4000-8000-000000000011';
const debtB = '00000000-0000-4000-8000-000000000012';

describe('BudgetCalculator', () => {
  const calculator = new BudgetCalculator();

  it('calculates monthly income, fixed/variable expenses, debt, savings, and available money', () => {
    const result = calculator.calculate({
      month: '2026-01',
      incomes: [mockIncome],
      expenses: [
        mockExpense,
        { ...mockExpense, id: '00000000-0000-4000-8000-000000000013', kind: 'variable' },
      ],
      debtPayments: [
        {
          id: '00000000-0000-4000-8000-000000000014',
          familyId: mockIncome.familyId,
          debtId: mockDebt.id,
          amount: 200_000,
          date: '2026-01-15',
          createdAt: mockIncome.createdAt,
        },
      ],
      savingsTransactions: [],
    });

    expect(result).toMatchObject({
      income: 2_500_000,
      fixedExpenses: 1_250_000,
      variableExpenses: 1_250_000,
      expenses: 2_500_000,
      debtPayments: 200_000,
      available: -200_000,
    });
  });

  it('returns zero totals when there are no incomes, expenses, debt, or savings', () => {
    expect(
      calculator.calculate({
        month: '2026-01',
        incomes: [],
        expenses: [],
        debtPayments: [],
        savingsTransactions: [],
      }),
    ).toMatchObject({ income: 0, expenses: 0, debtPayments: 0, savings: 0, available: 0 });
  });

  it('includes savings withdrawals as available money', () => {
    const result = calculator.calculate({
      month: '2026-01',
      incomes: [],
      expenses: [],
      debtPayments: [],
      savingsTransactions: [
        {
          id: '00000000-0000-4000-8000-000000000015',
          familyId: mockIncome.familyId,
          goalId: mockSavingsGoal.id,
          kind: 'withdrawal',
          amount: 50_000,
          date: '2026-01-15',
          createdAt: mockIncome.createdAt,
        },
      ],
    });
    expect(result.available).toBe(50_000);
  });
});

describe('income calculations', () => {
  it.each([
    ['monthly', 1_000_000],
    ['biweekly', (1_000_000 * 26) / 12],
    ['weekly', (1_000_000 * 52) / 12],
  ] as const)('normalizes %s income to an average month', (frequency, total) => {
    expect(
      calculateMonthlyIncomeTotal([{ ...mockIncome, amount: 1_000_000, frequency }], '2026-01'),
    ).toBeCloseTo(total);
  });

  it('counts occasional income only in its effective month', () => {
    const income = { ...mockIncome, amount: 300_000, frequency: 'occasional' as const };
    expect(calculateMonthlyIncomeTotal([income], '2026-01')).toBe(300_000);
    expect(calculateMonthlyIncomeTotal([income], '2026-02')).toBe(0);
  });
});

describe('DebtPlanner', () => {
  const planner = new DebtPlanner();
  const debts = [
    {
      id: debtA,
      name: 'Saldo pequeño',
      remainingBalance: 100,
      annualInterestRate: 0,
      minimumPayment: 20,
    },
    {
      id: debtB,
      name: 'Tasa alta',
      remainingBalance: 200,
      annualInterestRate: 24,
      minimumPayment: 20,
    },
  ];

  it('prioritizes the lowest balance in snowball and highest rate in avalanche', () => {
    const common = { debts, extraMonthlyPayment: 100, startMonth: '2026-01' };
    const snowball = planner.calculate({ ...common, strategy: 'snowball' });
    const avalanche = planner.calculate({ ...common, strategy: 'avalanche' });

    expect(
      snowball.monthlyProjection[0]?.payments.find((payment) => payment.debtId === debtA)?.payment,
    ).toBe(100);
    expect(
      avalanche.monthlyProjection[0]?.payments.find((payment) => payment.debtId === debtB)?.payment,
    ).toBe(120);
    expect(avalanche.monthlyProjection[0]?.totalPayment).toBe(140);
    expect(snowball.estimatedDebtFreeMonth).toBeTruthy();
    expect(snowball.disclaimer).toContain('no constituye una garantía');
  });

  it('uses a user-defined order and rejects an incomplete custom order', () => {
    const result = planner.calculate({
      debts,
      strategy: 'custom',
      customOrder: [debtB, debtA],
      extraMonthlyPayment: 100,
      startMonth: '2026-01',
    });
    expect(
      result.monthlyProjection[0]?.payments.find((payment) => payment.debtId === debtB)?.payment,
    ).toBe(120);
    expect(() =>
      planner.calculate({
        debts,
        strategy: 'custom',
        customOrder: [debtB],
        extraMonthlyPayment: 100,
        startMonth: '2026-01',
      }),
    ).toThrow(/cada deuda exactamente una vez/);
  });

  it('rolls the freed minimum payment into the remaining debt', () => {
    const result = planner.calculate({
      debts: [
        { ...debts[0]!, remainingBalance: 50, minimumPayment: 50 },
        { ...debts[1]!, remainingBalance: 200, annualInterestRate: 0 },
      ],
      strategy: 'snowball',
      extraMonthlyPayment: 0,
      startMonth: '2026-01',
    });
    expect(
      result.monthlyProjection[1]?.payments.find((payment) => payment.debtId === debtB)?.payment,
    ).toBe(70);
  });

  it('handles no debt and refuses a payment that cannot cover accruing interest', () => {
    expect(
      planner.calculate({
        debts: [],
        strategy: 'snowball',
        extraMonthlyPayment: 0,
        startMonth: '2026-01',
      }).estimatedMonths,
    ).toBe(0);
    expect(() =>
      planner.calculate({
        debts: [
          { ...debts[0]!, remainingBalance: 100, annualInterestRate: 120, minimumPayment: 1 },
        ],
        strategy: 'snowball',
        extraMonthlyPayment: 0,
        startMonth: '2026-01',
      }),
    ).toThrow(/no alcanza/);
  });
});

describe('DebtSimulator', () => {
  it('compares current and improved scenarios without mutating inputs', () => {
    const input = {
      debts: [
        {
          id: debtA,
          name: 'Deuda',
          remainingBalance: 1_000,
          annualInterestRate: 0,
          minimumPayment: 100,
        },
      ],
      monthlyIncome: 2_000,
      monthlyExpenses: 1_500,
      currentExtraDebtPayment: 0,
      changes: { incomeIncrease: 100, expenseReduction: 100, debtPaymentIncrease: 0 },
      strategy: 'snowball' as const,
      startMonth: '2026-01',
    };
    const before = structuredClone(input);
    const result = new DebtSimulator().simulate(input);

    expect(result.simulated.estimatedMonths).toBeLessThan(result.current.estimatedMonths);
    expect(result.monthsDifference).toBeGreaterThan(0);
    expect(result.simulated.estimatedDate).toBeTruthy();
    expect(result.simulated.monthlyEvolution.length).toBeGreaterThan(0);
    expect(input).toEqual(before);
  });

  it('returns matching payoff durations when there is no debt', () => {
    const result = new DebtSimulator().simulate({
      debts: [],
      monthlyIncome: 0,
      monthlyExpenses: 0,
      currentExtraDebtPayment: 0,
      changes: { incomeIncrease: 0, expenseReduction: 0, debtPaymentIncrease: 0 },
      strategy: 'snowball',
      startMonth: '2026-01',
    });
    expect(result.monthsDifference).toBe(0);
    expect(result.current.estimatedDate).toBeNull();
  });
});

describe('SavingsCalculator', () => {
  const calculator = new SavingsCalculator();

  it('calculates remaining amount, progress and required months', () => {
    expect(
      calculator.calculateProgress({
        targetAmount: 1_000,
        currentAmount: 250,
        monthlyContribution: 200,
      }),
    ).toEqual({
      targetAmount: 1_000,
      currentAmount: 250,
      remainingAmount: 750,
      progressPercent: 25,
      estimatedMonths: 4,
    });
  });

  it('handles completed goals and zero monthly contribution', () => {
    expect(
      calculator.calculateProgress({
        targetAmount: 1_000,
        currentAmount: 1_200,
        monthlyContribution: 0,
      }),
    ).toMatchObject({ remainingAmount: 0, progressPercent: 100, estimatedMonths: 0 });
    expect(
      calculator.calculateProgress({
        targetAmount: 1_000,
        currentAmount: 0,
        monthlyContribution: 0,
      }).estimatedMonths,
    ).toBeNull();
  });

  it('rejects negative savings inputs', () => {
    expect(() =>
      calculator.calculateProgress({
        targetAmount: 1_000,
        currentAmount: -1,
        monthlyContribution: 5,
      }),
    ).toThrow(RangeError);
  });
});

describe('FinancialSummaryCalculator', () => {
  it('returns dashboard totals, upcoming bills, category distribution and debt progress', () => {
    const result = new FinancialSummaryCalculator().calculate({
      month: '2026-01',
      asOfDate: '2026-01-01',
      incomes: [mockIncome],
      expenses: [mockExpense],
      expenseCategories: [],
      debts: [mockDebt],
      debtPayments: [],
      savingsGoals: [mockSavingsGoal],
      savingsTransactions: [],
    });
    expect(result).toMatchObject({
      totalIncome: 2_500_000,
      totalExpenses: 1_250_000,
      totalDebt: 4_800_000,
      totalSavings: 200_000,
      availableMoney: 1_250_000,
      debtProgress: { originalPrincipal: 4_800_000, remainingBalance: 4_800_000, percentage: 0 },
    });
    expect(result.upcomingPayments).toHaveLength(2);
    expect(result.expenseDistribution[0]).toMatchObject({
      categoryName: 'Sin categoría',
      percentage: 100,
    });
  });
});
