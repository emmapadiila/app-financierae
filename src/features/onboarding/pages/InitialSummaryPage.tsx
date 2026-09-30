import { Link } from 'react-router-dom';
import { useDashboard } from '../../dashboard/hooks/useDashboard';
import { AppShell } from '../../../components/layout/AppShell';
import { Card } from '../../../components/ui/Controls';
import { Icon } from '../../../components/ui/Icon';
import { StepProgress } from '../../../components/ui/ProgressBar';
import { SummaryCard, DistributionBar } from '../../../components/finance/SummaryCard';
import { formatMoney, formatMonth } from '../../../shared/utils/presentation';

export function InitialSummaryPage() {
  const dashboard = useDashboard();
  if (!dashboard) return null;
  const { model, currency, month } = dashboard;
  return <AppShell navigation={false}><div className="onboarding"><header className="onboarding-header"><span className="w-2" /><StepProgress step={5} /></header><main id="main" className="onboarding-main"><p className="text-brand text-sm mb-2">¡Listo!</p><h1>Así están tus finanzas</h1><p className="muted mt-3 mb-6">Esta es tu foto financiera de {formatMonth(month).toLowerCase()}.</p><SummaryCard values={model.budget} currency={currency} initial /><Card className="mt-5"><h2 className="muted text-xs mb-3">Distribución de ingresos</h2><DistributionBar values={model.budget} /></Card><p className="saved-confirmation" role="status"><Icon name="shield" />Tus datos ya están guardados en este dispositivo.</p>{model.plannedSavings > 0 && <p className="reserve-note">Meta mensual: <b>{formatMoney(model.plannedSavings, currency)}</b>. Ahorro apartado este mes: <b>{formatMoney(model.budget.savings, currency)}</b>.</p>}{model.summary.totalDebt > 0 && <p className="muted text-xs mt-4">Deuda pendiente: {formatMoney(model.summary.totalDebt, currency)}. El disponible descuenta los pagos registrados, no todo el saldo de tus deudas.</p>}{model.budget.available < 0 && <p className="error-notice">Tus gastos y aportes superan tus ingresos este mes. El disponible refleja ese déficit.</p>}</main><footer className="onboarding-footer"><Link to="/dashboard" replace className="button button-primary"><Icon name="rocket" />Ir a mi Dashboard</Link></footer></div></AppShell>;
}
