import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useFinance } from '../../../app/state/financeContext';
import { localDate, type MovementInput } from '../../../app/services/financeWorkspace';
import { AppShell } from '../../../components/layout/AppShell';
import { Button, Card, EmptyState, ErrorNotice, Field, MoneyField, Segmented } from '../../../components/ui/Controls';
import { Icon } from '../../../components/ui/Icon';
import { categories } from '../../../shared/utils/categories';
import { errorMessage, formatMoney } from '../../../shared/utils/presentation';

const variants = [ { kind: 'expense', label: '🛒 Gasto', title: 'Nuevo gasto', save: 'Guardar gasto' }, { kind: 'income', label: '💰 Ingreso', title: 'Nuevo ingreso', save: 'Guardar ingreso' }, { kind: 'debt-payment', label: '💳 Pago', title: 'Registrar pago', save: 'Guardar pago' } ] as const;
const methods = [{ value: 'cash', label: '💵 Efectivo' }, { value: 'card', label: '💳 Tarjeta' }, { value: 'transfer', label: '📱 Transferencia' }, { value: 'wallet', label: '📲 Nequi/Daviplata' }] as const;

export function NewTransactionPage() {
  const { app, family, data, setMonth, recordMovement } = useFinance();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const variant = variants.find(item => item.kind === params.get('kind')) ?? variants[0];
  const kind = variant.kind;
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [expenseKind, setExpenseKind] = useState<'fixed' | 'variable'>('variable');
  const [date, setDate] = useState(localDate);
  const [method, setMethod] = useState<MovementInput['paymentMethod']>('cash');
  const [note, setNote] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [debtId, setDebtId] = useState('');
  const [frequency, setFrequency] = useState<MovementInput['frequency']>('occasional');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  if (!app || !family || !data) return null;
  const debt = data.debts.find(item => item.id === debtId);
  const unpaidDebts = data.debts.filter(item => item.remainingBalance > 0);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    if (kind === 'expense' && !category) { setError('Selecciona una categoría para el gasto.'); return; }
    lock.current = true; setSaving(true); setError('');
    try {
      await recordMovement({ kind, amount: Number(amount), name, date, category: kind === 'expense' ? category : kind === 'income' ? 'Ingreso' : 'Deuda', expenseKind, frequency, ...(debtId ? { debtId } : {}), paymentMethod: method, note, repeatMonthly: repeat });
      setMonth(date.slice(0, 7));
      void navigate('/dashboard', { state: { saved: true }, replace: true });
    } catch (reason) { setError(errorMessage(reason)); lock.current = false; setSaving(false); }
  }
  return <AppShell navigation={false}><form onSubmit={event => void submit(event)}><header className={`movement-header header-${kind}`}><Link to="/transactions" className="back-link"><Icon name="back" />Volver</Link><div className="movement-tabs" role="group" aria-label="Tipo de movimiento">{variants.map(item => <button type="button" key={item.kind} disabled={saving} aria-pressed={kind === item.kind} className={item.kind === kind ? 'active' : ''} onClick={() => { setParams({ kind: item.kind }, { replace: true }); setError(''); }}>{item.label}</button>)}</div><h1>{variant.title}</h1></header><main id="main" className="movement-form"><Card className="amount-card"><MoneyField label="Valor" value={amount} onChange={setAmount} min={0.01} prominent required /></Card>{kind === 'debt-payment' && unpaidDebts.length === 0 ? <Card><EmptyState icon="💳">No tienes deudas pendientes para registrar un pago.</EmptyState><Link className="text-link block text-center" to="/transactions">Volver a movimientos</Link></Card> : <><Card className="space-y-6">{kind === 'debt-payment' && <><label className="field"><span>Deuda a pagar</span><select required value={debtId} onChange={event => { setDebtId(event.target.value); const selected = unpaidDebts.find(item => item.id === event.target.value); if (selected) setName(`Pago de ${selected.name}`.slice(0, 120)); }}><option value="">Selecciona una deuda</option>{unpaidDebts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{debt && <p className="reserve-note">Saldo pendiente: {formatMoney(debt.remainingBalance, family.currency)}</p>}</>}
    <Field label="Nombre" value={name} onChange={event => setName(event.target.value)} placeholder={kind === 'income' ? '¿De dónde viene este ingreso?' : kind === 'expense' ? '¿En qué gastaste?' : 'Descripción del pago'} required maxLength={120} />
    {kind === 'expense' ? <fieldset><legend className="field-label">Categoría</legend><div className="chips">{categories.filter(item => item.name !== 'Ingreso' && item.name !== 'Deuda').map(item => <button type="button" className={category === item.name ? 'chosen' : ''} key={item.name} aria-pressed={category === item.name} onClick={() => setCategory(item.name)}>{item.icon} {item.name}</button>)}<button type="button" aria-pressed={category === 'Otros'} className={category === 'Otros' ? 'chosen' : ''} onClick={() => setCategory('Otros')}>🧾 Otros</button></div></fieldset> : <div><p className="field-label">Categoría</p><span className="category-chip">{kind === 'income' ? '💰 Ingreso' : '💳 Deuda'}</span></div>}
    {kind === 'expense' && <div><p className="field-label">Tipo</p><Segmented label="Tipo de gasto" value={expenseKind} options={[{ value: 'fixed', label: 'Fijo' }, { value: 'variable', label: 'Variable' }]} onChange={setExpenseKind} /></div>}
    <Field label="Fecha" type="date" value={date} required max={kind === 'expense' ? undefined : localDate()} onChange={event => setDate(event.target.value)} />
    <fieldset><legend className="field-label">Método de pago</legend><div className="chips">{methods.map(item => <button type="button" key={item.value} className={method === item.value ? 'chosen' : ''} aria-pressed={method === item.value} onClick={() => setMethod(item.value)}>{item.label}</button>)}</div></fieldset>
    <label className="field"><span>Notas (opcional)</span><textarea placeholder="Agrega un comentario…" value={note} maxLength={500} rows={2} onChange={event => setNote(event.target.value)} /></label>
    {kind === 'expense' && <><label className="checkbox-label"><input type="checkbox" checked={repeat} onChange={event => setRepeat(event.target.checked)} />Repetir cada mes</label>{repeat && <p className="muted text-xs">Los próximos cargos se crearán como pendientes al abrir la aplicación cada mes.</p>}</>}
    {kind === 'income' && <label className="field"><span>Frecuencia del ingreso</span><select value={frequency} onChange={event => setFrequency(event.target.value as MovementInput['frequency'])}><option value="occasional">Solo esta vez</option><option value="monthly">Cada mes</option><option value="biweekly">Cada dos semanas</option><option value="weekly">Cada semana</option></select></label>}
    </Card><ErrorNotice message={error} /><Button type="submit" disabled={saving}>{saving ? 'Guardando…' : variant.save}</Button></>}</main></form></AppShell>;
}
