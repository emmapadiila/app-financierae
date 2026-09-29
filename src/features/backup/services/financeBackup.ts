import { z } from 'zod';
import {
  debtPaymentSchema,
  debtSchema,
  expenseCategorySchema,
  expenseSchema,
  familySchema,
  financialSettingsSchema,
  financialTransactionSchema,
  incomeSchema,
  monthlyBudgetSchema,
  savingsGoalSchema,
  savingsTransactionSchema,
} from '../../../domain/models/financial';
import type {
  FinanceRepositories,
  RepositoryName,
  TransactionRunner,
} from '../../../domain/ports/financeRepositories';
import { currentTimestamp } from '../../../shared/utils/dates';
import type {
  Debt,
  DebtPayment,
  Expense,
  ExpenseCategory,
  Family,
  FinancialSettings,
  FinancialTransaction,
  Income,
  MonthlyBudget,
  SavingsGoal,
  SavingsTransaction,
} from '../../../domain/models/financial';
import { ConfirmationRequiredError } from '../../../shared/utils/serviceErrors';

export interface FinanceBackup {
  version: 1;
  exportedAt: string;
  family: Family | null;
  incomes: Income[];
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  savingsGoals: SavingsGoal[];
  savingsTransactions: SavingsTransaction[];
  transactions: FinancialTransaction[];
  budgets: MonthlyBudget[];
  settings: FinancialSettings | null;
}

const backupSchema = z
  .object({
    version: z.literal(1),
    exportedAt: z.iso.datetime(),
    family: familySchema.nullable(),
    incomes: z.array(incomeSchema),
    expenses: z.array(expenseSchema),
    expenseCategories: z.array(expenseCategorySchema),
    debts: z.array(debtSchema),
    debtPayments: z.array(debtPaymentSchema),
    savingsGoals: z.array(savingsGoalSchema),
    savingsTransactions: z.array(savingsTransactionSchema),
    transactions: z.array(financialTransactionSchema),
    budgets: z.array(monthlyBudgetSchema),
    settings: financialSettingsSchema.nullable(),
  })
  .strict()
  .superRefine((backup, context) => {
    const records = [
      ...(backup.family ? [backup.family] : []),
      ...backup.incomes,
      ...backup.expenses,
      ...backup.expenseCategories,
      ...backup.debts,
      ...backup.debtPayments,
      ...backup.savingsGoals,
      ...backup.savingsTransactions,
      ...backup.transactions,
      ...backup.budgets,
      ...(backup.settings ? [backup.settings] : []),
    ];
    const ids = new Set<string>();
    for (const record of records) {
      if (ids.has(record.id)) {
        context.addIssue({ code: 'custom', message: `Identificador duplicado: ${record.id}` });
      }
      ids.add(record.id);
    }

    const familyId = backup.family?.id;
    for (const record of records) {
      if ('familyId' in record && record.familyId !== familyId) {
        context.addIssue({
          code: 'custom',
          message: 'Todos los registros deben pertenecer a la familia exportada.',
        });
        break;
      }
    }

    const debtIds = new Set(backup.debts.map((debt) => debt.id));
    if (backup.debtPayments.some((payment) => !debtIds.has(payment.debtId))) {
      context.addIssue({ code: 'custom', message: 'Un pago hace referencia a una deuda inexistente.' });
    }

    const goalIds = new Set(backup.savingsGoals.map((goal) => goal.id));
    if (backup.savingsTransactions.some((transaction) => !goalIds.has(transaction.goalId))) {
      context.addIssue({ code: 'custom', message: 'Un movimiento hace referencia a una meta inexistente.' });
    }

    const categoryIds = new Set(backup.expenseCategories.map((category) => category.id));
    if (
      backup.expenses.some((expense) => expense.categoryId && !categoryIds.has(expense.categoryId))
    ) {
      context.addIssue({ code: 'custom', message: 'Un gasto hace referencia a una categoría inexistente.' });
    }
  });

export function validateFinanceBackup(input: unknown): FinanceBackup {
  return backupSchema.parse(input);
}

export function parseFinanceBackup(json: string): FinanceBackup {
  let data: unknown;
  try {
    data = JSON.parse(json) as unknown;
  } catch (error) {
    throw new SyntaxError('El archivo no contiene JSON válido.', { cause: error });
  }
  return validateFinanceBackup(data);
}

export async function createFinanceBackup(
  repositories: FinanceRepositories,
  exportedAt = currentTimestamp(),
): Promise<FinanceBackup> {
  const [families, incomes, expenses, expenseCategories, debts, debtPayments, savingsGoals, savingsTransactions, transactions, budgets, settings] =
    await Promise.all([
      repositories.families.list(),
      repositories.incomes.list(),
      repositories.expenses.list(),
      repositories.expenseCategories.list(),
      repositories.debts.list(),
      repositories.debtPayments.list(),
      repositories.savingsGoals.list(),
      repositories.savingsTransactions.list(),
      repositories.transactions.list(),
      repositories.budgets.list(),
      repositories.settings.list(),
    ]);
  if (families.length > 1 || settings.length > 1) {
    throw new Error('El respaldo v1 admite una familia y una configuración.');
  }

  return validateFinanceBackup({
    version: 1,
    exportedAt,
    family: families[0] ?? null,
    incomes,
    expenses,
    expenseCategories,
    debts,
    debtPayments,
    savingsGoals,
    savingsTransactions,
    transactions,
    budgets,
    settings: settings[0] ?? null,
  });
}

const repositoryNames: readonly RepositoryName[] = [
  'families',
  'incomes',
  'expenses',
  'expenseCategories',
  'debts',
  'debtPayments',
  'savingsGoals',
  'savingsTransactions',
  'transactions',
  'budgets',
  'settings',
];

export interface ImportBackupOptions {
  confirmReplace?: boolean;
}

export async function importFinanceBackup(
  json: string,
  repositories: FinanceRepositories,
  transactionRunner: TransactionRunner,
  options: ImportBackupOptions = {},
): Promise<FinanceBackup> {
  const backup = parseFinanceBackup(json);
  const hasExistingData = (
    await Promise.all(repositoryNames.map((name) => repositories[name].list()))
  ).some((records) => records.length > 0);
  if (hasExistingData && options.confirmReplace !== true) {
    throw new ConfirmationRequiredError();
  }

  await transactionRunner.run(repositoryNames, async () => {
    await Promise.all(repositoryNames.map((name) => repositories[name].deleteAll()));
    await Promise.all([
      repositories.families.saveMany(backup.family ? [backup.family] : []),
      repositories.incomes.saveMany(backup.incomes),
      repositories.expenses.saveMany(backup.expenses),
      repositories.expenseCategories.saveMany(backup.expenseCategories),
      repositories.debts.saveMany(backup.debts),
      repositories.debtPayments.saveMany(backup.debtPayments),
      repositories.savingsGoals.saveMany(backup.savingsGoals),
      repositories.savingsTransactions.saveMany(backup.savingsTransactions),
      repositories.transactions.saveMany(backup.transactions),
      repositories.budgets.saveMany(backup.budgets),
      repositories.settings.saveMany(backup.settings ? [backup.settings] : []),
    ]);
  });

  return backup;
}