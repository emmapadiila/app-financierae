import type {
  Debt,
  DebtPayment,
  Expense,
  Family,
  Income,
  SavingsGoal,
} from '../../src/domain/models/financial';

export const familyId = '00000000-0000-4000-8000-000000000001';
export const debtId = '00000000-0000-4000-8000-000000000002';
export const incomeId = '00000000-0000-4000-8000-000000000003';
export const expenseId = '00000000-0000-4000-8000-000000000004';
export const savingsGoalId = '00000000-0000-4000-8000-000000000005';
export const timestamp = '2026-01-01T00:00:00.000Z';

export const mockFamily: Family = {
  id: familyId,
  name: 'Familia de prueba',
  currency: 'COP',
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const mockIncome: Income = {
  id: incomeId,
  familyId,
  name: 'Ingreso mensual',
  amount: 2_500_000,
  frequency: 'monthly',
  effectiveDate: '2026-01-01',
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const mockExpense: Expense = {
  id: expenseId,
  familyId,
  name: 'Servicios',
  amount: 1_250_000,
  kind: 'fixed',
  dueDate: '2026-01-10',
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const mockDebt: Debt = {
  id: debtId,
  familyId,
  name: 'Tarjeta de crédito',
  creditor: 'Banco de prueba',
  principal: 4_800_000,
  remainingBalance: 4_800_000,
  annualInterestRate: 0,
  minimumPayment: 200_000,
  dueDay: 20,
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const mockDebtPayment: DebtPayment = {
  id: '00000000-0000-4000-8000-000000000006',
  familyId,
  debtId,
  amount: 200_000,
  date: '2026-01-15',
  createdAt: timestamp,
};

export const mockSavingsGoal: SavingsGoal = {
  id: savingsGoalId,
  familyId,
  name: 'Fondo de emergencia',
  targetAmount: 1_000_000,
  currentAmount: 200_000,
  createdAt: timestamp,
  updatedAt: timestamp,
};