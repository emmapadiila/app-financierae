import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useFinance } from '../../../app/state/financeContext';
import { onboardingSchema, type OnboardingInput } from '../../../app/services/financeWorkspace';
import { selectedExpenseTotal } from '../../../app/services/dashboardModel';
import { AppShell } from '../../../components/layout/AppShell';
import { Button, Card, ErrorNotice } from '../../../components/ui/Controls';
import { CurrencyInput } from '../../../components/ui/CurrencyInput';
import { Icon } from '../../../components/ui/Icon';
import { FinanceIcon } from '../../../components/ui/FinanceIcon';
import { ProgressBar, StepProgress } from '../../../components/ui/ProgressBar';
import { householdExpenses } from '../../../shared/utils/categories';
import { createId } from '../../../shared/utils/ids';
import { errorMessage, formatMoney } from '../../../shared/utils/presentation';
import { ExpenseEditor } from '../components/ExpenseEditor';
import { DebtEditor } from '../components/DebtEditor';

type Expense = OnboardingInput['expenses'][number] & { key: string };
type Debt = OnboardingInput['debts'][number] & { key: string };
const titles = ['¿Cuánto dinero entra a tu hogar cada mes?', 'Agrega tus gastos principales', '¿Tienes deudas actualmente?', '¿Cuánto quieres reservar para ahorrar cada mes?'];
const subtitles = ['Incluye salarios, arriendos, pensiones o cualquier ingreso regular.', 'Selecciona los que apliquen a tu hogar.', 'Préstamos, tarjetas de crédito, cuotas. Sin juzgar.', 'Elige una reserva que se ajuste a tus ingresos.'];

export function OnboardingPage() {
  const { initialize, family } = useFinance();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [income, setIncome] = useState('');
  const [savings, setSavings] = useState('');
  const [setAside, setSetAside] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [hasDebt, setHasDebt] = useState<boolean | null>(null);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [expenseEditor, setExpenseEditor] = useState<{ key: string; initial: Partial<Expense>; custom: boolean } | null>(null);
  const [debtEditor, setDebtEditor] = useState<{ key: string; initial?: Debt } | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveLock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); window.scrollTo(0, 0); }, [step]);
  useEffect(() => { if (saved && family) void navigate('/onboarding/summary', { replace: true }); }, [saved, family, navigate]);
  if (family && !saving) return <Navigate to="/dashboard" replace />;
  const totalExpenses = selectedExpenseTotal(expenses);
  const savingsPercent = Number(income) > 0 ? Math.round(Number(savings) / Number(income) * 100) : null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saveLock.current) return;
    setError('');
    if (step === 3 && hasDebt === null) { setError('Selecciona si tienes deudas para continuar.'); return; }
    if (step === 3 && hasDebt && debts.length === 0) { setError('Registra una deuda o selecciona «No tengo».'); return; }
    if (step < 4) { setStep(step + 1); return; }
    try {
      const input = onboardingSchema.parse({ income: Number(income), savings: Number(savings), savingsAlreadySetAside: setAside, expenses, debts: hasDebt ? debts : [] });
      saveLock.current = true; setSaving(true);
      await initialize(input);
      setSaved(true);
    } catch (reason) { setError(errorMessage(reason)); saveLock.current = false; setSaving(false); }
  }
  function editExpense(item: (typeof householdExpenses)[number]) {
    const existing = expenses.find(expense => expense.key === item.name);
    setExpenseEditor({ key: item.name, initial: existing ?? { name: item.name, category: item.category }, custom: false });
  }
  return <AppShell navigation={false}><div className="onboarding">
    <header className="onboarding-header"><button type="button" aria-label={step > 1 ? 'Paso anterior' : 'Volver al inicio'} disabled={saving} onClick={() => { if (step > 1) { setStep(step - 1); setError(''); } else void navigate('/'); }}><Icon name="back" /></button><StepProgress step={step} /></header>
    <main id="main" className="onboarding-main"><p className="text-brand text-sm mb-2">Paso {step} de 5</p><h1 ref={heading} tabIndex={-1}>{titles[step - 1]}</h1><p className="muted mt-3 mb-6 leading-relaxed">{subtitles[step - 1]}</p>
      <form id="onboarding-form" onSubmit={event => void submit(event)}><fieldset disabled={saving} className="min-w-0">
      {step === 1 && <><Card><CurrencyInput label="Ingreso mensual total" value={income} onChange={setIncome} prominent required /><p className="muted text-sm mt-3">{formatMoney(Number(income))} COP / mes</p></Card><Button variant="secondary" type="button" className="mt-5" onClick={() => setIncome('0')}>Por ahora no tengo ingresos</Button><p className="muted text-xs mt-4">Ingresa el valor real de tu hogar. No necesitas conectar una cuenta bancaria.</p></>}
      {step === 2 && <><div className="expense-options">{householdExpenses.map(item => { const selected = expenses.find(expense => expense.key === item.name); return <button key={item.name} type="button" className={`expense-option ${selected ? 'chosen' : ''}`} aria-label={`${selected ? 'Editar' : 'Agregar'} ${item.name}`} onClick={() => editExpense(item)}><FinanceIcon category={item.name} /><span>{item.name}<small>{selected ? formatMoney(selected.amount) : 'Agregar valor'}</small></span>{selected && <span className="choice-check"><Icon name="check" /></span>}</button>; })}</div>
        {expenses.length > 0 && <ul className="selected-expenses">{expenses.filter(item => !householdExpenses.some(option => option.name === item.key)).map(item => <li key={item.key}><span>{item.name}</span><b>{formatMoney(item.amount)}</b><button type="button" className="icon-button" aria-label={`Quitar ${item.name}`} onClick={() => setExpenses(items => items.filter(expense => expense.key !== item.key))}><Icon name="close" /></button></li>)}</ul>}
        <div className="selection-total"><span>Total gastos seleccionados</span><b>{formatMoney(totalExpenses)}</b></div><Button variant="ghost" type="button" onClick={() => setExpenseEditor({ key: createId(), initial: {}, custom: true })}><Icon name="plus" />Agregar otro gasto</Button><p className="muted text-xs mt-3">Los gastos seleccionados se repetirán cada mes. Si no tienes gastos, puedes continuar.</p></>}
      {step === 3 && <><div className="grid grid-cols-2 gap-3">{[{ value: true, icon: 'debt' as const, title: 'Sí tengo', text: 'Registraré mis deudas' }, { value: false, icon: 'party' as const, title: 'No tengo', text: '¡Qué bien!' }].map(option => <button key={option.title} type="button" aria-pressed={hasDebt === option.value} className={`debt-choice ${hasDebt === option.value ? 'chosen' : ''}`} onClick={() => { setHasDebt(option.value); setError(''); if (option.value && debts.length === 0) setDebtEditor({ key: createId() }); }}><FinanceIcon name={option.icon} /><span>{option.title}</span><small>{option.text}</small></button>)}</div>{hasDebt && <div className="space-y-3 mt-4">{debts.map(debt => <Card key={debt.key}><div className="section-heading"><h2>{debt.name}</h2><button className="icon-button" type="button" aria-label={`Quitar ${debt.name}`} onClick={() => setDebts(items => items.filter(item => item.key !== debt.key))}><Icon name="close" /></button></div><p className="muted text-sm">Saldo pendiente</p><p className="text-xl my-1">{formatMoney(debt.remainingBalance ?? debt.principal)}</p><button type="button" className="text-link" onClick={() => setDebtEditor({ key: debt.key, initial: debt })}>Editar datos</button></Card>)}<Button type="button" variant="ghost" onClick={() => setDebtEditor({ key: createId() })}><Icon name="plus" />Agregar otra deuda</Button></div>}</>}
      {step === 4 && <><Card><CurrencyInput label="Meta de ahorro mensual" value={savings} onChange={setSavings} prominent required /><div className="flex gap-3 items-center mt-5"><ProgressBar value={savingsPercent ?? 0} label="Reserva respecto al ingreso" /><span className="text-brand text-sm">{savingsPercent === null ? '—' : `${savingsPercent}%`}</span></div></Card><Button type="button" variant="secondary" className="mt-5" onClick={() => { setSavings('0'); setSetAside(false); }}>Por ahora no reservaré dinero</Button>{Number(savings) > 0 && <label className="checkbox-label savings-confirmation"><input type="checkbox" checked={setAside} onChange={event => setSetAside(event.target.checked)} /><span>Ya aparté este dinero para ahorrar este mes</span></label>}<p className="muted text-xs mt-4 leading-relaxed">Guardaremos tu meta mensual. Solo registraremos un aporte de ahorro si confirmas que ya apartaste el dinero.</p></>}
      </fieldset><ErrorNotice message={error} /></form>
    </main><footer className="onboarding-footer"><Button type="submit" form="onboarding-form" disabled={saving}>{saving ? 'Guardando tus datos…' : step === 4 ? 'Guardar y ver resumen' : 'Continuar'}</Button></footer>
    {expenseEditor && <ExpenseEditor onRemove={expenseEditor.initial.amount === undefined ? undefined : () => { setExpenses(items => items.filter(item => item.key !== expenseEditor.key)); setExpenseEditor(null); }} initial={expenseEditor.initial} custom={expenseEditor.custom} onClose={() => setExpenseEditor(null)} onSave={expense => { setExpenses(items => [...items.filter(item => item.key !== expenseEditor.key), { ...expense, key: expenseEditor.key }]); setExpenseEditor(null); }} />}
    {debtEditor && <DebtEditor initial={debtEditor.initial} onClose={() => setDebtEditor(null)} onSave={debt => { setDebts(items => [...items.filter(item => item.key !== debtEditor.key), { ...debt, key: debtEditor.key }]); setDebtEditor(null); }} />}
  </div></AppShell>;
}
