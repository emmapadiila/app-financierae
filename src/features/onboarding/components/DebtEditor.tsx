import { useState, type FormEvent } from 'react';
import { onboardingSchema, type OnboardingInput } from '../../../app/services/financeWorkspace';
import { Button, ErrorNotice, Field } from '../../../components/ui/Controls';
import { CurrencyInput } from '../../../components/ui/CurrencyInput';
import { FormDialog } from '../../../components/ui/FormDialog';
import { errorMessage } from '../../../shared/utils/presentation';
type Debt = OnboardingInput['debts'][number];
export function DebtEditor({ initial, onSave, onClose }: { initial?: Debt | undefined; onSave: (value: Debt) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [creditor, setCreditor] = useState(initial?.creditor ?? '');
  const [principal, setPrincipal] = useState(initial ? String(initial.principal) : '');
  const [remaining, setRemaining] = useState(initial ? String(initial.remainingBalance ?? initial.principal) : '');
  const [minimum, setMinimum] = useState(initial ? String(initial.minimumPayment) : '');
  const [interest, setInterest] = useState(initial ? String(initial.annualInterestRate) : '');
  const [day, setDay] = useState(initial ? String(initial.dueDay) : '');
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    try { onSave(onboardingSchema.shape.debts.element.parse({ name, creditor, principal: Number(principal), remainingBalance: Number(remaining), minimumPayment: Number(minimum), annualInterestRate: Number(interest), dueDay: Number(day) })); } catch (reason) { setError(errorMessage(reason)); }
  }
  return <FormDialog title={initial ? 'Editar deuda' : 'Registrar una deuda'} onClose={onClose}><form onSubmit={submit} className="space-y-5"><Field label="Nombre de la deuda" value={name} onChange={event => setName(event.target.value)} maxLength={120} required /><Field label="Acreedor" value={creditor} onChange={event => setCreditor(event.target.value)} maxLength={120} required /><div className="grid gap-5 sm:grid-cols-2"><CurrencyInput label="Monto original" value={principal} onChange={setPrincipal} required min={0.01} /><CurrencyInput label="Saldo pendiente" value={remaining} onChange={setRemaining} required /></div><CurrencyInput label="Cuota mínima mensual" value={minimum} onChange={setMinimum} required /><Field label="Tasa de interés anual (%)" type="number" inputMode="decimal" min="0" max="1000" step="0.01" value={interest} onChange={event => setInterest(event.target.value)} required /><Field label="Día de vencimiento" type="number" inputMode="numeric" min="1" max="31" value={day} onChange={event => setDay(event.target.value)} required /><ErrorNotice message={error} /><Button type="submit">Guardar deuda</Button></form></FormDialog>;
}
