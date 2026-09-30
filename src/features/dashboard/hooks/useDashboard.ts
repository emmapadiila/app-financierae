import { useFinance } from '../../../app/state/financeContext';
import { createDashboardModel } from '../../../app/services/dashboardModel';
export function useDashboard() {
  const finance = useFinance();
  if (!finance.data || !finance.app || !finance.family) return null;
  return { ...finance, family: finance.family, data: finance.data, currency: finance.data.settings?.currency ?? finance.family.currency, model: createDashboardModel(finance.data, finance.app.calculators, finance.month) };
}
