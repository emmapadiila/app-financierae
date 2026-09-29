import { Navigate, Route, Routes } from 'react-router-dom';
import { BackupPage } from '../../features/backup/pages/BackupPage';
import { BudgetPage } from '../../features/budget/pages/BudgetPage';
import { CalendarPage } from '../../features/calendar/pages/CalendarPage';
import { DebtDetailPage } from '../../features/debts/pages/DebtDetailPage';
import { DebtsPage } from '../../features/debts/pages/DebtsPage';
import { DebtPlanPage } from '../../features/debt-plan/pages/DebtPlanPage';
import { DashboardPage } from '../../features/dashboard/pages/DashboardPage';
import { OnboardingPage } from '../../features/onboarding/pages/OnboardingPage';
import { SplashPage } from '../../features/onboarding/pages/SplashPage';
import { ReportsPage } from '../../features/reports/pages/ReportsPage';
import { SavingsPage } from '../../features/savings/pages/SavingsPage';
import { SettingsPage } from '../../features/settings/pages/SettingsPage';
import { SimulatorPage } from '../../features/simulator/pages/SimulatorPage';
import { NewTransactionPage } from '../../features/transactions/pages/NewTransactionPage';
import { TransactionsPage } from '../../features/transactions/pages/TransactionsPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<SplashPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/transactions" element={<TransactionsPage />} />
      <Route path="/transactions/new" element={<NewTransactionPage />} />
      <Route path="/debts" element={<DebtsPage />} />
      <Route path="/debts/:debtId" element={<DebtDetailPage />} />
      <Route path="/debt-plan" element={<DebtPlanPage />} />
      <Route path="/simulator" element={<SimulatorPage />} />
      <Route path="/budget" element={<BudgetPage />} />
      <Route path="/savings" element={<SavingsPage />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/backup" element={<BackupPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
