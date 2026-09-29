import { z } from 'zod';

const idSchema = z.uuid();
const amountSchema = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveAmountSchema = amountSchema.gt(0);
const dateSchema = z.iso.date();
const timestampSchema = z.iso.datetime();
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const timestampsSchema = z.object({
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const familySchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1).max(120),
    currency: currencySchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type Family = z.infer<typeof familySchema>;

export const incomeSchema = z
  .object({
    id: idSchema,
    familyId: idSchema,
    name: z.string().trim().min(1).max(120),
    amount: positiveAmountSchema,
    frequency: z.enum(['monthly', 'biweekly', 'weekly', 'occasional']),
    effectiveDate: dateSchema,
    endDate: dateSchema.optional(),
    isActive: z.boolean(),
    ...timestampsSchema.shape,
  })
  .strict()
  .refine((income) => !income.endDate || income.endDate >= income.effectiveDate, {
    path: ['endDate'],
    message: 'La fecha final no puede ser anterior a la fecha inicial.',
  });
export type Income = z.infer<typeof incomeSchema>;

export const expenseCategorySchema = z
  .object({
    id: idSchema,
    familyId: idSchema,
    name: z.string().trim().min(1).max(80),
    ...timestampsSchema.shape,
  })
  .strict();
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const expenseSchema = z
  .object({
    id: idSchema,
    familyId: idSchema,
    categoryId: idSchema.optional(),
    name: z.string().trim().min(1).max(120),
    amount: positiveAmountSchema,
    kind: z.enum(['fixed', 'variable']),
    dueDate: dateSchema,
    paidAt: timestampSchema.optional(),
    ...timestampsSchema.shape,
  })
  .strict();
export type Expense = z.infer<typeof expenseSchema>;

export const debtSchema = z
  .object({
    id: idSchema,
    familyId: idSchema,
    name: z.string().trim().min(1).max(120),
    creditor: z.string().trim().min(1).max(120),
    principal: positiveAmountSchema,
    remainingBalance: amountSchema,
    annualInterestRate: amountSchema.max(1000),
    minimumPayment: amountSchema,
    dueDay: z.number().int().min(1).max(31).optional(),
    ...timestampsSchema.shape,
  })
  .strict();
export type Debt = z.infer<typeof debtSchema>;

export const debtPaymentSchema = z
  .object({
    id: idSchema,
    familyId: idSchema,
    debtId: idSchema,
    amount: positiveAmountSchema,
    date: dateSchema,
    note: z.string().trim().max(500).optional(),
    createdAt: timestampSchema,
  })
  .strict();
export type DebtPayment = z.infer<typeof debtPaymentSchema>;

export const savingsGoalSchema = z
  .object({
    id: idSchema,
    familyId: idSchema,
    name: z.string().trim().min(1).max(120),
    targetAmount: positiveAmountSchema,
    currentAmount: amountSchema,
    targetDate: dateSchema.optional(),
    ...timestampsSchema.shape,
  })
  .strict();
export type SavingsGoal = z.infer<typeof savingsGoalSchema>;

export const savingsTransactionSchema = z
  .object({
    id: idSchema,
    familyId: idSchema,
    goalId: idSchema,
    kind: z.enum(['contribution', 'withdrawal']),
    amount: positiveAmountSchema,
    date: dateSchema,
    note: z.string().trim().max(500).optional(),
    createdAt: timestampSchema,
  })
  .strict();
export type SavingsTransaction = z.infer<typeof savingsTransactionSchema>;

export const financialTransactionSchema = z
  .object({
    id: idSchema,
    familyId: idSchema,
    kind: z.enum([
      'income',
      'expense',
      'debt-payment',
      'savings-contribution',
      'savings-withdrawal',
    ]),
    description: z.string().trim().min(1).max(160),
    amount: positiveAmountSchema,
    date: dateSchema,
    relatedEntityId: idSchema.optional(),
    ...timestampsSchema.shape,
  })
  .strict();
export type FinancialTransaction = z.infer<typeof financialTransactionSchema>;

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const monthlyBudgetSchema = z
  .object({
    id: idSchema,
    familyId: idSchema,
    month: monthSchema,
    plannedIncome: amountSchema,
    plannedFixedExpenses: amountSchema,
    plannedVariableExpenses: amountSchema,
    plannedDebtPayments: amountSchema,
    plannedSavings: amountSchema,
    ...timestampsSchema.shape,
  })
  .strict();
export type MonthlyBudget = z.infer<typeof monthlyBudgetSchema>;

export const financialSettingsSchema = z
  .object({
    id: idSchema,
    familyId: idSchema,
    currency: currencySchema,
    locale: z.string().min(2).max(35),
    weekStartsOn: z.number().int().min(0).max(6),
    ...timestampsSchema.shape,
  })
  .strict();
export type FinancialSettings = z.infer<typeof financialSettingsSchema>;

export type IdentifiedEntity = { id: string };