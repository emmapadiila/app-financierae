import { z } from 'zod';
import {
  debtPaymentSchema,
  debtSchema,
  type Debt,
  type DebtPayment,
} from '../../../domain/models/financial';
import type {
  EntityRepository,
  TransactionRunner,
} from '../../../domain/ports/financeRepositories';
import { currentTimestamp } from '../../../shared/utils/dates';
import { createId } from '../../../shared/utils/ids';
import { EntityNotFoundError } from '../../../shared/utils/serviceErrors';

const debtCreateSchema = debtSchema
  .omit({ id: true, familyId: true, remainingBalance: true, createdAt: true, updatedAt: true })
  .extend({ remainingBalance: z.number().finite().nonnegative().optional() });
const debtPatchSchema = debtSchema
  .omit({ id: true, familyId: true, createdAt: true, updatedAt: true })
  .partial()
  .strict();
const paymentInputSchema = z.object({
  amount: z.number().finite().positive().max(Number.MAX_SAFE_INTEGER),
  date: z.iso.date(),
  note: z.string().trim().max(500).optional(),
});

export type CreateDebtInput = z.input<typeof debtCreateSchema>;
export type UpdateDebtInput = z.input<typeof debtPatchSchema>;
export type RegisterDebtPaymentInput = z.input<typeof paymentInputSchema>;

export interface DebtServiceOptions {
  idFactory?: () => string;
  now?: () => string;
}

export interface DebtPaymentResult {
  debt: Debt;
  payment: DebtPayment;
  isPaid: boolean;
}

export class DebtService {
  private readonly idFactory: () => string;
  private readonly now: () => string;

  constructor(
    private readonly debts: EntityRepository<Debt>,
    private readonly payments: EntityRepository<DebtPayment>,
    private readonly transactionRunner: TransactionRunner,
    private readonly familyId: string,
    options: DebtServiceOptions = {},
  ) {
    this.idFactory = options.idFactory ?? createId;
    this.now = options.now ?? currentTimestamp;
  }

  async create(input: CreateDebtInput): Promise<Debt> {
    const data = debtCreateSchema.parse(input);
    const timestamp = this.now();
    const debt = debtSchema.parse({
      ...data,
      remainingBalance: data.remainingBalance ?? data.principal,
      id: this.idFactory(),
      familyId: this.familyId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.debts.save(debt);
    return debt;
  }

  async list(): Promise<Debt[]> {
    return (await this.debts.list()).filter((debt) => debt.familyId === this.familyId);
  }

  async get(id: string): Promise<Debt> {
    const debt = await this.debts.get(id);
    if (!debt || debt.familyId !== this.familyId) throw new EntityNotFoundError('Deuda', id);
    return debt;
  }

  async update(id: string, patch: UpdateDebtInput): Promise<Debt> {
    const existing = await this.get(id);
    const data = debtPatchSchema.parse(patch);
    const updated = debtSchema.parse({ ...existing, ...data, updatedAt: this.now() });
    await this.debts.save(updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    await this.transactionRunner.run(['debts', 'debtPayments'], async () => {
      const relatedPayments = (await this.payments.list()).filter((payment) => payment.debtId === id);
      await Promise.all(relatedPayments.map((payment) => this.payments.delete(payment.id)));
      await this.debts.delete(id);
    });
  }

  async getPaymentHistory(debtId: string): Promise<DebtPayment[]> {
    await this.get(debtId);
    return (await this.payments.list())
      .filter((payment) => payment.debtId === debtId && payment.familyId === this.familyId)
      .sort((left, right) => right.date.localeCompare(left.date));
  }

  async registerPayment(debtId: string, input: RegisterDebtPaymentInput): Promise<DebtPaymentResult> {
    const data = paymentInputSchema.parse(input);
    return this.transactionRunner.run(['debts', 'debtPayments'], async () => {
      const debt = await this.get(debtId);
      if (debt.remainingBalance === 0) {
        throw new EntityNotFoundError('Deuda pendiente', debtId);
      }
      const payment = debtPaymentSchema.parse({
        ...data,
        id: this.idFactory(),
        familyId: this.familyId,
        debtId,
        createdAt: this.now(),
      });
      const updatedDebt = debtSchema.parse({
        ...debt,
        remainingBalance: Math.max(0, debt.remainingBalance - payment.amount),
        updatedAt: this.now(),
      });
      await this.payments.save(payment);
      await this.debts.save(updatedDebt);
      return { debt: updatedDebt, payment, isPaid: updatedDebt.remainingBalance === 0 };
    });
  }

  isPaid(debt: Debt): boolean {
    return debt.remainingBalance === 0;
  }
}