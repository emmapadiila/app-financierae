import { createContext, useContext } from 'react';
import type { Family } from '../../domain/models/financial';
import type { FinanceDatabase } from '../../infrastructure/storage/FinanceDatabase';
import type { FinanceApplication, WorkspaceData } from '../services/financeWorkspace';

export interface FinanceContextValue {
  database: FinanceDatabase;
  family: Family | null;
  app: FinanceApplication | null;
  data: WorkspaceData | null;
  loading: boolean;
  error: string;
  month: string;
  setMonth: (month: string) => void;
  dark: boolean;
  toggleTheme: () => void;
}
export const FinanceContext = createContext<FinanceContextValue | null>(null);
export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('Falta FinanceProvider.');
  return context;
}
