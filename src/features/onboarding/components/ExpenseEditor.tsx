import { useState, type FormEvent } from 'react';
import { onboardingSchema, localDate, type OnboardingInput } from '../../../app/services/financeWorkspace';
import { Button, ErrorNotice, Field } from '../../../components/ui/Controls';
import { CurrencyInput } from '../../../components/ui/CurrencyInput';
import { FormDialog } from '../../../components/ui/FormDialog';
import { errorMessage } from '../../../shared/utils/presentation';

type Expense = OnboardingInput['expenses'][number];
export function ExpenseEditor({ initial, onSave, onClose, onRemove, custom = false }: { initial: Partial<Expense>; onSave: (value: Expense) => void; onClose: () => void; onRemove?: (() => void) | undefined; custom?: boolean }) {
  const [name, setName] = useState(initial.name ?? '');
  const [amount, setAmount] = useState(initial.amount === undefined ? '' : String(initial.amount));
  const [dueDate, setDueDate] = useState(initial.dueDate ?? localDate());
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    try { const expense = onboardingSchema.shape.expenses.element.parse({ name, category: initial.category ?? 'Otros', amount: Number(amount), dueDate }); onSave(expense); } catch (reason) { setError(errorMessage(reason)); }
  }
  return <FormDialog title={custom ? 'Agregar otro gasto' : `Gasto de ${name}`} onClose={onClose}><form onSubmit={submit} className="space-y-5">{custom && <Field label="Nombre del gasto" required maxLength={120} value={name} onChange={event => setName(event.target.value)} />}<CurrencyInput label="Valor mensual" value={amount} onChange={setAmount} min={0.01} required prominent /><Field label="Fecha de vencimiento" type="date" required value={dueDate} onChange={event => setDueDate(event.target.value)} /><p className="muted text-xs">Se guardará como gasto fijo pendiente. Podrás registrar el pago más adelante.</p><ErrorNotice message={error} /><Button type="submit">Guardar gasto</Button>{onRemove && <Button type="button" variant="secondary" onClick={onRemove}>Quitar este gasto</Button>}</form></FormDialog>;
}
