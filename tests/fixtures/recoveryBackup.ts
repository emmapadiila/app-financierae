import type { FinanceBackup } from '../../src/features/backup/services/financeBackup';
import {
  familyId,
  mockFamily,
  mockIncome,
  mockExpense,
  mockDebt,
  mockDebtPayment,
  mockSavingsGoal,
  timestamp,
} from './mockFinanceData';

export function recoveryBackup(): FinanceBackup {
  const base = { familyId, createdAt: timestamp, updatedAt: timestamp };
  const categoryId = '00000000-0000-4000-8000-000000000007';
  return {
    version: 1,
    exportedAt: timestamp,
    family: { ...mockFamily },
    incomes: [{ ...mockIncome }],
    expenses: [{ ...mockExpense, categoryId }],
    expenseCategories: [{ ...base, id: categoryId, name: 'Hogar' }],
    debts: [{ ...mockDebt, remainingBalance: mockDebt.principal - mockDebtPayment.amount }],
    debtPayments: [{ ...mockDebtPayment }],
    savingsGoals: [{ ...mockSavingsGoal }],
    savingsTransactions: [
      {
        id: '00000000-0000-4000-8000-000000000008',
        familyId,
        createdAt: timestamp,
        goalId: mockSavingsGoal.id,
        kind: 'contribution',
        amount: mockSavingsGoal.currentAmount,
        date: '2026-01-01',
      },
    ],
    transactions: [
      {
        ...base,
        id: '00000000-0000-4000-8000-000000000009',
        kind: 'income',
        description: mockIncome.name,
        amount: mockIncome.amount,
        date: mockIncome.effectiveDate,
        relatedEntityId: mockIncome.id,
      },
    ],
    budgets: [
      {
        ...base,
        id: '00000000-0000-4000-8000-000000000010',
        month: '2026-01',
        plannedIncome: mockIncome.amount,
        plannedFixedExpenses: mockExpense.amount,
        plannedVariableExpenses: 0,
        plannedDebtPayments: mockDebtPayment.amount,
        plannedSavings: mockSavingsGoal.currentAmount,
      },
    ],
    settings: {
      ...base,
      id: '00000000-0000-4000-8000-000000000011',
      currency: 'COP',
      locale: 'es-CO',
      weekStartsOn: 1,
      debtPlan: { strategy: 'avalanche', customOrder: [mockDebt.id] },
    },
  };
}
