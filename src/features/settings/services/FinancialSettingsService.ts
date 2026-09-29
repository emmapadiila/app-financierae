import { z } from 'zod';
import {
  financialSettingsSchema,
  type FinancialSettings,
} from '../../../domain/models/financial';
import type { EntityRepository } from '../../../domain/ports/financeRepositories';
import { currentTimestamp } from '../../../shared/utils/dates';
import { createId } from '../../../shared/utils/ids';

const settingsInputSchema = financialSettingsSchema.omit({
  id: true,
  familyId: true,
  createdAt: true,
  updatedAt: true,
});
export type UpdateFinancialSettingsInput = z.input<typeof settingsInputSchema>;

export class FinancialSettingsService {
  constructor(
    private readonly repository: EntityRepository<FinancialSettings>,
    private readonly familyId: string,
    private readonly idFactory: () => string = createId,
    private readonly now: () => string = currentTimestamp,
  ) {}

  async get(): Promise<FinancialSettings | undefined> {
    return (await this.repository.list()).find((settings) => settings.familyId === this.familyId);
  }

  async update(input: UpdateFinancialSettingsInput): Promise<FinancialSettings> {
    const data = settingsInputSchema.parse(input);
    const existing = await this.get();
    const timestamp = this.now();
    const settings = financialSettingsSchema.parse({
      ...data,
      id: existing?.id ?? this.idFactory(),
      familyId: this.familyId,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
    await this.repository.save(settings);
    return settings;
  }
}