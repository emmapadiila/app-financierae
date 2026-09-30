import { liveQuery } from 'dexie';
import { FinanceDatabase } from '../../infrastructure/storage/FinanceDatabase';
import type { Family } from '../../domain/models/financial';
import { createFinanceApplication } from './createFinanceApplication';
import {
  completeOnboarding,
  findFamily,
  loadWorkspace,
  materializeRecurringExpenses,
  saveMovement,
  type FinanceApplication,
  type MovementInput,
  type OnboardingInput,
  type WorkspaceData,
} from './financeWorkspace';

export interface FinanceSnapshot {
  family: Family | null;
  app: Pick<FinanceApplication, 'services' | 'calculators'> | null;
  data: WorkspaceData | null;
}

// React receives application operations and immutable snapshots, never a database
// handle. Storage observation and connection ownership stay in the application layer.
export function createFinanceSession(database = new FinanceDatabase()) {
  return {
    initialize: (input: OnboardingInput) => completeOnboarding(database, input),
    async recordMovement(input: MovementInput) {
      const family = await findFamily(database);
      if (!family) throw new Error('Primero configura tu familia.');
      return saveMovement(createFinanceApplication(family.id, database), family.id, input);
    },
    subscribe(next: (snapshot: FinanceSnapshot) => void, error: (reason: unknown) => void) {
      let active = true;
      const subscription = liveQuery(async (): Promise<FinanceSnapshot> => {
        const family = await findFamily(database);
        if (!family) return { family: null, app: null, data: null };
        const application = createFinanceApplication(family.id, database);
        return {
          family,
          app: { services: application.services, calculators: application.calculators },
          data: await loadWorkspace(application, family.id),
        };
      }).subscribe({
        next: (snapshot) => {
          if (active) next(snapshot);
        },
        error: (reason: unknown) => {
          if (active) error(reason);
        },
      });
      void (async () => {
        const family = await findFamily(database);
        if (family)
          await materializeRecurringExpenses(
            createFinanceApplication(family.id, database),
            family.id,
          );
      })().catch((reason: unknown) => {
        if (active) error(reason);
      });
      return () => {
        active = false;
        subscription.unsubscribe();
      };
    },
    close: () => database.close(),
  };
}
export type FinanceSession = ReturnType<typeof createFinanceSession>;
