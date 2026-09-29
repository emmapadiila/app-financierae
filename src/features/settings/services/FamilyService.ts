import { z } from 'zod';
import { familySchema, type Family } from '../../../domain/models/financial';
import type { EntityRepository } from '../../../domain/ports/financeRepositories';
import { currentTimestamp } from '../../../shared/utils/dates';
import { createId } from '../../../shared/utils/ids';
import { EntityNotFoundError } from '../../../shared/utils/serviceErrors';

const familyInputSchema = familySchema.omit({ id: true, createdAt: true, updatedAt: true });
export type CreateFamilyInput = z.input<typeof familyInputSchema>;

export class FamilyService {
  constructor(
    private readonly repository: EntityRepository<Family>,
    private readonly idFactory: () => string = createId,
    private readonly now: () => string = currentTimestamp,
  ) {}

  async create(input: CreateFamilyInput): Promise<Family> {
    if ((await this.repository.list()).length > 0) {
      throw new Error('Ya existe una familia configurada en este dispositivo.');
    }
    const timestamp = this.now();
    const family = familySchema.parse({
      ...familyInputSchema.parse(input),
      id: this.idFactory(),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.repository.save(family);
    return family;
  }

  async get(): Promise<Family> {
    const family = (await this.repository.list())[0];
    if (!family) throw new EntityNotFoundError('Familia', 'actual');
    return family;
  }

  async update(input: CreateFamilyInput): Promise<Family> {
    const existing = await this.get();
    const updated = familySchema.parse({
      ...existing,
      ...familyInputSchema.parse(input),
      updatedAt: this.now(),
    });
    await this.repository.save(updated);
    return updated;
  }
}