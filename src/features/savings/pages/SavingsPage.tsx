import { useState } from 'react';
import { useFinance } from '../../../app/state/financeContext';
import type { SavingsGoal } from '../../../domain/models/financial';
import { localDate } from '../../../app/services/financeWorkspace';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { MonthSelector } from '../../../components/finance/MonthSelector';
import { Card, Button, EmptyState, Field, Segmented } from '../../../components/ui/Controls';
import { FormDialog } from '../../../components/ui/FormDialog';
import { AsyncForm } from '../../../components/ui/AsyncForm';
import { CurrencyInput } from '../../../components/ui/CurrencyInput';
import { ProgressBar } from '../../../components/ui/ProgressBar';
import { formatMoney, formatDate } from '../../../shared/utils/presentation';

function GoalEditor({ goal, onClose }: { goal?: SavingsGoal; onClose: () => void }) {
  const { app } = useFinance();
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? String(goal.targetAmount) : '');
  const [date, setDate] = useState(goal?.targetDate ?? '');
  const [remove, setRemove] = useState(false);
  return (
    <FormDialog
      title={remove ? 'Eliminar meta' : goal ? 'Editar meta' : 'Nueva meta'}
      onClose={onClose}
    >
      <AsyncForm
        label={remove ? 'Confirmar eliminación' : 'Guardar meta'}
        onCancel={onClose}
        onSave={async () => {
          if (remove && goal) await app!.services.savings.deleteGoal(goal.id);
          else {
            const input = {
              name,
              targetAmount: Number(target),
              ...(date ? { targetDate: date } : {}),
            };
            if (goal)
              await app!.services.savings.updateGoal(goal.id, {
                ...input,
                targetDate: date || undefined,
              });
            else await app!.services.savings.createGoal(input);
          }
          onClose();
        }}
      >
        {remove ? (
          <p>
            Se eliminará «{goal?.name}» y todo su historial de aportes y retiros. Los totales se
            recalcularán.
          </p>
        ) : (
          <>
            <Field
              label="Nombre de la meta"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <CurrencyInput
              label="Monto objetivo"
              required
              min={0.01}
              value={target}
              onChange={setTarget}
            />
            <Field
              label="Fecha objetivo (opcional)"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {goal && (
              <button type="button" className="text-link danger" onClick={() => setRemove(true)}>
                Eliminar meta
              </button>
            )}
          </>
        )}
      </AsyncForm>
    </FormDialog>
  );
}
function SavingsMovement({ goal, onClose }: { goal: SavingsGoal; onClose: () => void }) {
  const { app } = useFinance();
  const [kind, setKind] = useState<'contribution' | 'withdrawal'>('contribution');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localDate);
  const [note, setNote] = useState('');
  return (
    <FormDialog title={goal.name} onClose={onClose}>
      <AsyncForm
        label="Guardar aporte o retiro"
        onCancel={onClose}
        onSave={async () => {
          const input = { amount: Number(amount), date, note };
          if (kind === 'contribution') await app!.services.savings.contribute(goal.id, input);
          else await app!.services.savings.withdraw(goal.id, input);
          onClose();
        }}
      >
        <Segmented
          label="Operación de ahorro"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'contribution', label: 'Aportar' },
            { value: 'withdrawal', label: 'Retirar' },
          ]}
        />
        <CurrencyInput label="Valor" required min={0.01} value={amount} onChange={setAmount} />
        <Field
          label="Fecha"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Field
          label="Nota"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </AsyncForm>
    </FormDialog>
  );
}
export function SavingsPage() {
  const { data, app, family, month, setMonth } = useFinance();
  const [editor, setEditor] = useState<SavingsGoal | 'new' | null>(null);
  const [movement, setMovement] = useState<SavingsGoal | null>(null);
  if (!data || !app || !family) return null;
  const money = (n: number) => formatMoney(n, data.settings?.currency ?? family.currency);
  const contributions = data.savingsTransactions.filter(
    (t) => t.date.startsWith(month) && t.kind === 'contribution',
  );
  return (
    <AppShell>
      <PageHeader title="Mis metas">
        <MonthSelector month={month} onChange={setMonth} />
        <div className="movement-totals">
          <div>
            <b className="text-brand">
              {money(data.savingsGoals.reduce((s, g) => s + g.currentAmount, 0))}
            </b>
            <span>Total ahorrado</span>
          </div>
          <div>
            <b>{money(contributions.reduce((s, t) => s + t.amount, 0))}</b>
            <span>Aportes del mes</span>
          </div>
          <div>
            <b>{data.savingsGoals.filter((g) => g.currentAmount < g.targetAmount).length}</b>
            <span>Metas activas</span>
          </div>
        </div>
      </PageHeader>
      <main id="main" className="page-content space-y-4">
        {!data.savingsGoals.length && (
          <Card>
            <EmptyState icon="🐷">Todavía no tienes metas de ahorro.</EmptyState>
          </Card>
        )}
        <div className="debt-grid">
          {data.savingsGoals.map((goal, i) => {
            const progress = app.calculators.savings.calculateProgress({
              ...goal,
              monthlyContribution: 0,
            });
            return (
              <section className="goal-card" key={goal.id}>
                <header className={`tool-color-${i % 2}`}>
                  <span aria-hidden="true">🐷</span>
                  <div>
                    <h2>{goal.name}</h2>
                    <small>
                      {goal.targetDate ? `Objetivo: ${formatDate(goal.targetDate)}` : 'A tu ritmo'}
                    </small>
                  </div>
                  <b>{Math.round(progress.progressPercent)}%</b>
                </header>
                <div className="p-4">
                  <div className="goal-amounts">
                    <div>
                      <small>Ahorrado</small>
                      <strong className="text-brand">{money(goal.currentAmount)}</strong>
                    </div>
                    <div>
                      <small>Meta</small>
                      <strong>{money(goal.targetAmount)}</strong>
                    </div>
                  </div>
                  <ProgressBar
                    label={`Progreso de ${goal.name}`}
                    value={progress.progressPercent}
                  />
                  <p className="muted text-xs my-2">{money(progress.remainingAmount)} restantes</p>
                  <div className="debt-actions">
                    <Button variant="secondary" onClick={() => setEditor(goal)}>
                      Editar meta
                    </Button>
                    <Button onClick={() => setMovement(goal)}>Agregar →</Button>
                  </div>
                  <details className="mt-3">
                    <summary>Historial de ahorro</summary>
                    <ul className="payment-history">
                      {data.savingsTransactions
                        .filter((t) => t.goalId === goal.id)
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map((t) => (
                          <li key={t.id}>
                            <span>
                              {formatDate(t.date)} ·{' '}
                              {t.kind === 'contribution' ? 'Aporte' : 'Retiro'}
                            </span>
                            <b>{money(t.amount)}</b>
                            {t.note && <small>{t.note}</small>}
                          </li>
                        ))}
                    </ul>
                    {!data.savingsTransactions.some((t) => t.goalId === goal.id) && (
                      <p className="muted text-sm mt-2">Sin movimientos todavía.</p>
                    )}
                  </details>
                </div>
              </section>
            );
          })}
        </div>
        <Button variant="ghost" onClick={() => setEditor('new')}>
          + Nueva meta
        </Button>
      </main>
      {editor && (
        <GoalEditor
          {...(editor === 'new' ? {} : { goal: editor })}
          onClose={() => setEditor(null)}
        />
      )}
      {movement && <SavingsMovement goal={movement} onClose={() => setMovement(null)} />}
    </AppShell>
  );
}
