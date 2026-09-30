import { createContext, useContext } from 'react';
import type { Family } from '../../domain/models/financial';
import type { WorkspaceData } from '../services/financeWorkspace';
import type { FinanceSession, FinanceSnapshot } from '../services/financeSession';

export interface FinanceContextValue {
  initialize: FinanceSession['initialize'];
  recordMovement: FinanceSession['recordMovement'];
  family: Family | null;
  app: FinanceSnapshot['app'];
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
