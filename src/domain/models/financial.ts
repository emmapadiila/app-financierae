import { z } from 'zod';

const idSchema = z.uuid();
const amountSchema = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveAmountSchema = amountSchema.gt(0);
const dateSchema = z.iso.date();
const timestampSchema = z.iso.datetime();
const currencySchema = z.string().regex(/^[A-Z]{3}$/);
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const recurrenceValuesSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount: positiveAmountSchema,
  day: z.number().int().min(1).max(31),
}).strict();
const recurrenceBaseSchema = recurrenceValuesSchema.extend({ startMonth: monthSchema });
const recurrenceChangeSchema = recurrenceValuesSchema.extend({ fromMonth: monthSchema });
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
    details: z.object({
      categoryName: z.string().trim().max(80).optional(),
      paymentMethod: z.enum(['cash', 'card', 'transfer', 'wallet']).optional(),
      note: z.string().trim().max(500).optional(),
      repeatMonthly: z.boolean().optional(),
      recurrenceSourceId: idSchema.optional(),
      // Stable period of a generated occurrence; absent in legacy records.
      recurrenceMonth: monthSchema.optional(),
      // Rule values are independent of the historical expense at the origin.
      recurrenceBase: recurrenceBaseSchema.optional(),
      recurrenceChanges: z.array(recurrenceChangeSchema)
        .refine(changes => changes.every((change, i) => i === 0 || changes[i - 1]!.fromMonth < change.fromMonth), 'Los cambios deben estar ordenados y tener meses únicos.')
        .optional(),
      recurrenceStoppedFrom: monthSchema.optional(),
      // Exceptions belong to this original transaction's familyId and id (series).
      omittedMonths: z.array(monthSchema)
        .refine(months => new Set(months).size === months.length, 'Los meses omitidos no pueden repetirse.')
        .optional(),
    }).strict().optional(),
    ...timestampsSchema.shape,
  })
  .strict()
  .superRefine((transaction, context) => {
    const details = transaction.details;
    if ((details?.recurrenceBase || details?.recurrenceChanges || details?.recurrenceStoppedFrom) && (
      transaction.kind !== 'expense' || !details.repeatMonthly || details.recurrenceSourceId
    )) {
      context.addIssue({ code: 'custom', path: ['details'], message: 'La configuración recurrente solo pertenece al origen de la serie.' });
    }
    if (details?.recurrenceChanges && (!details.recurrenceBase || details.recurrenceChanges.some(change => change.fromMonth < details.recurrenceBase!.startMonth))) {
      context.addIssue({ code: 'custom', path: ['details', 'recurrenceChanges'], message: 'Los cambios necesitan un origen y no pueden ser anteriores a él.' });
    }
    if (details?.recurrenceStoppedFrom && (!details.recurrenceBase || details.recurrenceStoppedFrom < details.recurrenceBase.startMonth)) {
      context.addIssue({ code: 'custom', path: ['details', 'recurrenceStoppedFrom'], message: 'El límite de la serie necesita un origen y no puede ser anterior a él.' });
    }
    if (details?.omittedMonths && (
      transaction.kind !== 'expense' || !details.repeatMonthly || details.recurrenceSourceId
    )) {
      context.addIssue({
        code: 'custom', path: ['details', 'omittedMonths'],
        message: 'Las excepciones solo pertenecen al origen de una serie de gastos.',
      });
    }
    if (details?.recurrenceMonth && (transaction.kind !== 'expense' || !details.recurrenceSourceId || details.repeatMonthly)) {
      context.addIssue({
        code: 'custom', path: ['details', 'recurrenceMonth'],
        message: 'El período recurrente solo pertenece a una ocurrencia generada.',
      });
    }
  });
export type FinancialTransaction = z.infer<typeof financialTransactionSchema>;

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
    debtPlan: z.object({ strategy: z.enum(['snowball', 'avalanche', 'custom']), customOrder: z.array(idSchema) }).strict().optional(),
    ...timestampsSchema.shape,
  })
  .strict();
export type FinancialSettings = z.infer<typeof financialSettingsSchema>;

export type IdentifiedEntity = { id: string };
