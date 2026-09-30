import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useFinance } from '../../../app/state/financeContext';
import { localDate, previewOnboarding, type OnboardingInput } from '../../../app/services/financeWorkspace';
import { AppShell } from '../../../components/layout/AppShell';
import { Button, Card, ErrorNotice, Field, MoneyField } from '../../../components/ui/Controls';
import { Icon } from '../../../components/ui/Icon';
import { DistributionBar, SummaryCard } from '../../../components/finance/SummaryCard';
import { householdExpenses } from '../../../shared/utils/categories';
import { errorMessage, formatMoney } from '../../../shared/utils/presentation';

type ExpenseDraft = { id: string; name: string; category: string; amount: string; icon: string; custom: boolean };
type DebtDraft = { id: string; name: string; creditor: string; principal: string; minimumPayment: string; annualInterestRate: string; dueDay: string };
const titles = ['¿Cuánto dinero entra a tu hogar cada mes?', 'Agrega tus gastos principales', '¿Tienes deudas actualmente?', '¿Cuánto quieres reservar para ahorrar cada mes?', 'Así están tus finanzas'];
const subtitles = ['Incluye salarios, arriendos, pensiones o cualquier ingreso regular.', 'Selecciona los que apliquen a tu hogar e ingresa sus valores.', 'Préstamos, tarjetas de crédito, cuotas. Sin juzgar.', 'Elige una reserva que se ajuste a tus ingresos.', 'Esta es tu foto financiera prevista de este mes.'];

export function OnboardingPage() {
  const { initialize, family } = useFinance();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [income, setIncome] = useState('');
  const [savings, setSavings] = useState('');
  const [expenses, setExpenses] = useState<ExpenseDraft[]>([]);
  const [hasDebt, setHasDebt] = useState<boolean | null>(null);
  const [debts, setDebts] = useState<DebtDraft[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved && family) void navigate('/dashboard', { replace: true }); }, [saved, family, navigate]);
  if (family && !saving) return <Navigate to="/dashboard" replace />;
  function input(): OnboardingInput {
    return { income: Number(income), savings: Number(savings), expenses: expenses.map(item => ({ name: item.name, category: item.category, amount: Number(item.amount) })), debts: hasDebt ? debts.map(item => ({ name: item.name, creditor: item.creditor, principal: Number(item.principal), minimumPayment: Number(item.minimumPayment), annualInterestRate: Number(item.annualInterestRate), dueDay: Number(item.dueDay) })) : [] };
  }
  const preview = step === 5 ? previewOnboarding(input(), localDate()) : null;
  function addDebt() { setDebts(items => [...items, { id: crypto.randomUUID(), name: '', creditor: '', principal: '', minimumPayment: '', annualInterestRate: '', dueDay: '' }]); }
  function updateDebt(id: string, key: keyof DebtDraft, value: string) { setDebts(items => items.map(item => item.id === id ? { ...item, [key]: value } : item)); }
  function toggleExpense(item: (typeof householdExpenses)[number]) {
    setExpenses(items => items.some(expense => expense.name === item.name) ? items.filter(expense => expense.name !== item.name) : [...items, { ...item, id: crypto.randomUUID(), amount: '', custom: false }]);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (step === 3 && hasDebt === null) { setError('Selecciona si tienes deudas para continuar.'); return; }
    if (step === 3 && hasDebt && debts.length === 0) { setError('Agrega al menos una deuda o selecciona «No tengo».'); return; }
    if (step < 5) {
      try { if (step === 4) previewOnboarding(input(), localDate()); setStep(step + 1); window.scrollTo(0, 0); } catch (reason) { setError(errorMessage(reason)); }
      return;
    }
    setSaving(true);
    try { await initialize(input()); setSaved(true); } catch (reason) { setError(errorMessage(reason)); setSaving(false); }
  }
  return <AppShell navigation={false}><form onSubmit={event => void submit(event)} className="onboarding"><header className="onboarding-header">{step > 1 ? <button type="button" aria-label="Paso anterior" disabled={saving} onClick={() => { setStep(step - 1); setError(''); }}><Icon name="back" /></button> : <span className="w-2" />}<div className="step-bars" role="progressbar" aria-label="Progreso de configuración" aria-valuemin={0} aria-valuemax={5} aria-valuenow={step}>{[1, 2, 3, 4, 5].map(item => <span key={item} className={item <= step ? 'done' : ''} />)}</div><span className="muted text-xs">{step}/5</span></header><main id="main" className="onboarding-main"><p className="text-brand text-sm mb-2">{step === 5 ? '¡Listo!' : `Paso ${step} de 5`}</p><h1>{titles[step - 1]}</h1><p className="muted mt-3 mb-6 leading-relaxed">{subtitles[step - 1]}</p>
    {step === 1 && <><Card><MoneyField label="Ingreso mensual total" value={income} onChange={setIncome} prominent required /><p className="muted text-sm mt-3">≈ {formatMoney(Number(income))} COP / mes</p></Card><Button variant="secondary" type="button" className="mt-5" onClick={() => setIncome('0')}>Por ahora no tengo ingresos</Button><p className="muted text-xs mt-4">Podrás registrar ingresos adicionales en cualquier momento.</p></>}
    {step === 2 && <><div className="expense-options">{householdExpenses.map(item => { const selected = expenses.some(expense => expense.name === item.name); return <button key={item.name} type="button" className={`expense-option ${selected ? 'chosen' : ''}`} aria-pressed={selected} onClick={() => toggleExpense(item)}><span className="text-2xl" aria-hidden="true">{item.icon}</span><span>{item.name}<small>{selected ? 'Seleccionado' : 'Agregar valor'}</small></span>{selected && <span className="choice-check">✓</span>}</button>; })}</div>{expenses.map(item => <Card key={item.id} className="mt-3"><div className="flex justify-between items-center mb-3"><b className="text-sm">{item.icon} {item.custom ? 'Otro gasto' : item.name}</b><button type="button" aria-label={`Quitar ${item.name || 'gasto'}`} onClick={() => setExpenses(items => items.filter(expense => expense.id !== item.id))}><Icon name="close" /></button></div>{item.custom && <Field label="Nombre del gasto" value={item.name} required maxLength={120} onChange={event => setExpenses(items => items.map(expense => expense.id === item.id ? { ...expense, name: event.target.value } : expense))} />}<MoneyField label={`Valor de ${item.name || 'otro gasto'}`} value={item.amount} required min={0.01} onChange={value => setExpenses(items => items.map(expense => expense.id === item.id ? { ...expense, amount: value } : expense))} /></Card>)}<div className="selection-total"><span>Total gastos seleccionados</span><b>{formatMoney(expenses.reduce((sum, item) => sum + Number(item.amount), 0))}</b></div><Button variant="ghost" type="button" onClick={() => setExpenses(items => [...items, { id: crypto.randomUUID(), name: '', category: 'Otros', amount: '', icon: '🧾', custom: true }])}>+ Agregar otro gasto</Button><p className="muted text-xs mt-3">Se registran como gastos fijos pendientes y se repiten cada mes.</p></>}
    {step === 3 && <><div className="grid grid-cols-2 gap-3">{[{ value: true, icon: '💳', title: 'Sí tengo', text: 'Registraré mis deudas' }, { value: false, icon: '🎉', title: 'No tengo', text: '¡Qué bien!' }].map(option => <button key={option.title} type="button" aria-pressed={hasDebt === option.value} className={`debt-choice ${hasDebt === option.value ? 'chosen' : ''}`} onClick={() => { setHasDebt(option.value); if (option.value && debts.length === 0) addDebt(); }}><span className="text-3xl" aria-hidden="true">{option.icon}</span><span>{option.title}</span><small>{option.text}</small></button>)}</div>{hasDebt && <div className="space-y-4 mt-4">{debts.map((debt, index) => <Card key={debt.id}><div className="flex justify-between mb-3"><h2>Deuda {index + 1}</h2><button type="button" aria-label={`Quitar deuda ${index + 1}`} onClick={() => setDebts(items => items.filter(item => item.id !== debt.id))}><Icon name="close" /></button></div><div className="space-y-4"><Field label="Nombre de la deuda" value={debt.name} required maxLength={120} onChange={event => updateDebt(debt.id, 'name', event.target.value)} /><Field label="Acreedor" value={debt.creditor} required maxLength={120} onChange={event => updateDebt(debt.id, 'creditor', event.target.value)} /><MoneyField label="Saldo actual" value={debt.principal} min={0.01} required onChange={value => updateDebt(debt.id, 'principal', value)} /><MoneyField label="Cuota mínima mensual" value={debt.minimumPayment} required onChange={value => updateDebt(debt.id, 'minimumPayment', value)} /><Field label="Tasa de interés anual (%)" type="number" min="0" max="1000" step="0.01" value={debt.annualInterestRate} required onChange={event => updateDebt(debt.id, 'annualInterestRate', event.target.value)} /><Field label="Día de vencimiento" type="number" min="1" max="31" value={debt.dueDay} required onChange={event => updateDebt(debt.id, 'dueDay', event.target.value)} /></div></Card>)}<Button type="button" variant="ghost" onClick={addDebt}>+ Agregar otra deuda</Button></div>}</>}
    {step === 4 && <><Card><MoneyField label="Meta de ahorro mensual" value={savings} onChange={setSavings} prominent required /><div className="flex gap-3 items-center mt-5"><progress max="100" value={Number(income) > 0 ? Math.min(100, Number(savings) / Number(income) * 100) : 0} aria-label="Reserva respecto al ingreso" /><span className="text-brand text-sm">{Number(income) > 0 ? `${Math.round(Number(savings) / Number(income) * 100)}%` : '—'}</span></div></Card><Button type="button" variant="secondary" className="mt-5" onClick={() => setSavings('0')}>Por ahora no reservaré dinero</Button><p className="muted text-xs mt-4">Esta reserva es un objetivo del presupuesto, no un aporte de ahorro ya realizado.</p></>}
    {step === 5 && preview && <><SummaryCard values={preview} projected /><Card className="mt-5"><p className="muted text-xs mb-3">Distribución prevista de ingresos</p><DistributionBar values={preview} /></Card>{preview.available < 0 && <p className="error-notice">Tus compromisos previstos superan tus ingresos. Puedes volver y ajustar los valores.</p>}<p className="muted text-xs mt-5 leading-relaxed">Al guardar se registrarán tus ingresos, gastos pendientes y deudas. El Dashboard distinguirá los pagos y ahorros realizados de lo que has presupuestado.</p></>}
    <ErrorNotice message={error} /></main><footer className="onboarding-footer"><Button type="submit" disabled={saving}>{saving ? 'Guardando tu presupuesto…' : step === 5 ? '🚀 Crear mi presupuesto' : 'Continuar'}</Button></footer></form></AppShell>;
}
