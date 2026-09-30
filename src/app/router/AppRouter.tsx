import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useFinance } from '../state/financeContext';
import { DashboardPage } from '../../features/dashboard/pages/DashboardPage';
import { OnboardingPage } from '../../features/onboarding/pages/OnboardingPage';
import { InitialSummaryPage } from '../../features/onboarding/pages/InitialSummaryPage';
import { SplashPage } from '../../features/onboarding/pages/SplashPage';
import { TransactionsPage } from '../../features/transactions/pages/TransactionsPage';
import { NewTransactionPage } from '../../features/transactions/pages/NewTransactionPage';
import { DebtsPage } from '../../features/debts/pages/DebtsPage';
import { DebtPlanPage } from '../../features/debt-plan/pages/DebtPlanPage';
import { PendingPage } from '../../components/layout/AppShell';

function RequireFamily({ children }: { children: ReactNode }) {
  const { family } = useFinance();
  return family ? children : <Navigate to="/" replace />;
}
export function AppRouter() {
  const { loading, error, family } = useFinance();
  if (loading) return <main className="loading-screen" role="status">Cargando tus finanzas…</main>;
  if (error) return <main className="loading-screen"><h1>No pudimos abrir tus datos</h1><p role="alert">{error}</p><button className="button button-primary" type="button" onClick={() => window.location.reload()}>Reintentar</button></main>;
  return <Routes><Route path="/" element={family ? <Navigate to="/dashboard" replace /> : <SplashPage />} /><Route path="/onboarding" element={<OnboardingPage />} /><Route path="/onboarding/summary" element={<RequireFamily><InitialSummaryPage /></RequireFamily>} /><Route path="/dashboard" element={<RequireFamily><DashboardPage /></RequireFamily>} /><Route path="/transactions" element={<RequireFamily><TransactionsPage /></RequireFamily>} /><Route path="/transactions/new" element={<RequireFamily><NewTransactionPage /></RequireFamily>} /><Route path="/debts" element={<RequireFamily><DebtsPage /></RequireFamily>} /><Route path="/debt-plan" element={<RequireFamily><DebtPlanPage /></RequireFamily>} />{['/debts/:debtId', '/more', '/simulator', '/budget', '/savings', '/calendar', '/reports', '/backup', '/settings'].map(path => <Route key={path} path={path} element={<RequireFamily><PendingPage /></RequireFamily>} />)}<Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
