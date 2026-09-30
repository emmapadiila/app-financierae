import { Icon } from '../ui/Icon';
import { addMonthsToMonth } from '../../shared/utils/dates';
import { formatMonth } from '../../shared/utils/presentation';

export function MonthSelector({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return <div className="month-selector"><button type="button" aria-label="Mes anterior" onClick={() => onChange(addMonthsToMonth(month, -1))}><Icon name="back" /></button><span aria-live="polite">{formatMonth(month)}</span><button type="button" aria-label="Mes siguiente" onClick={() => onChange(addMonthsToMonth(month, 1))}><Icon name="next" /></button></div>;
}
