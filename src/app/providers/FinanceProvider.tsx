import { useEffect, useState, type PropsWithChildren } from 'react';
import { liveQuery } from 'dexie';
import { FinanceDatabase } from '../../infrastructure/storage/FinanceDatabase';
import { createFinanceApplication } from '../services/createFinanceApplication';
import { findFamily, loadWorkspace, materializeRecurringExpenses, type FinanceApplication, type WorkspaceData } from '../services/financeWorkspace';
import { FinanceContext } from '../state/financeContext';
import type { Family } from '../../domain/models/financial';
import { currentMonth } from '../../shared/utils/dates';
import { errorMessage } from '../../shared/utils/presentation';

export function FinanceProvider({ children }: PropsWithChildren) {
  const [database] = useState(() => new FinanceDatabase());
  const [snapshot, setSnapshot] = useState<{ family: Family | null; app: FinanceApplication | null; data: WorkspaceData | null }>({ family: null, app: null, data: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(currentMonth);
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('mff-theme') === 'dark'; } catch { return false; } });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('mff-theme', dark ? 'dark' : 'light'); } catch { /* Theme remains usable when localStorage is unavailable. */ }
  }, [dark]);
  useEffect(() => {
    let active = true;
    const subscription = liveQuery(async () => {
      const family = await findFamily(database);
      if (!family) return { family: null, app: null, data: null };
      const app = createFinanceApplication(family.id, database);
      return { family, app, data: await loadWorkspace(app, family.id) };
    }).subscribe({ next: (value) => { if (active) { setSnapshot(value); setLoading(false); } }, error: (reason: unknown) => { if (active) { setError(errorMessage(reason)); setLoading(false); } } });
    async function recurring() {
      const family = await findFamily(database);
      if (family) await materializeRecurringExpenses(createFinanceApplication(family.id, database), family.id);
    }
    void recurring().catch((reason: unknown) => { if (active) setError(errorMessage(reason)); });
    return () => { active = false; subscription.unsubscribe(); };
  }, [database]);
  return <FinanceContext.Provider value={{ ...snapshot, database, loading, error, month, setMonth, dark, toggleTheme: () => setDark(value => !value) }}>{children}</FinanceContext.Provider>;
}
