import { useEffect, useState, type PropsWithChildren } from 'react';
import { createFinanceSession, type FinanceSnapshot } from '../services/financeSession';
import { FinanceContext } from '../state/financeContext';
import { currentMonth } from '../../shared/utils/dates';
import { errorMessage } from '../../shared/utils/presentation';

export function FinanceProvider({ children }: PropsWithChildren) {
  const [session] = useState(createFinanceSession);
  const [snapshot, setSnapshot] = useState<FinanceSnapshot>({
    family: null,
    app: null,
    data: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(currentMonth);
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem('mff-theme') === 'dark';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem('mff-theme', dark ? 'dark' : 'light');
    } catch {
      /* Theme remains usable when localStorage is unavailable. */
    }
  }, [dark]);
  useEffect(() => {
    return session.subscribe(
      (value) => {
        setSnapshot(value);
        setLoading(false);
      },
      (reason: unknown) => {
        setError(errorMessage(reason));
        setLoading(false);
      },
    );
  }, [session]);
  return (
    <FinanceContext.Provider
      value={{
        ...snapshot,
        initialize: session.initialize,
        recordMovement: session.recordMovement,
        loading,
        error,
        month,
        setMonth,
        dark,
        toggleTheme: () => setDark((value) => !value),
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
}
