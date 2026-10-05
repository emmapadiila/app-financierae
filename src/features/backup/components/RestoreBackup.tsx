import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ZodError } from 'zod';
import { useFinance } from '../../../app/state/financeContext';
import { Button, ErrorNotice } from '../../../components/ui/Controls';
import { FormDialog } from '../../../components/ui/FormDialog';
import { AsyncForm } from '../../../components/ui/AsyncForm';
import { parseFinanceBackup, type FinanceBackup } from '../services/financeBackup';

function backupError(reason: unknown) {
  if (reason instanceof ZodError) {
    return reason.issues.some((issue) => issue.path[0] === 'version')
      ? 'La versión de esta copia no es compatible. Selecciona un respaldo de versión 1.'
      : 'La copia contiene datos o referencias inválidas. Selecciona un respaldo válido de Mi Familia Finanzas.';
  }
  return reason instanceof Error ? reason.message : 'No se pudo leer la copia. Inténtalo de nuevo.';
}

export function RestoreBackup({
  recovery = false,
  disabled = false,
}: {
  recovery?: boolean;
  disabled?: boolean;
}) {
  const { importBackup, family } = useFinance();
  const navigate = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{
    json: string;
    backup: FinanceBackup;
    name: string;
  } | null>(null);
  function cancel() {
    if (!lock.current) setPending(null);
  }
  async function readFile(selected: File) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setPending(null);
    try {
      const json = await selected.text();
      const backup = parseFinanceBackup(json);
      if (!family && !backup.family)
        throw new Error(
          'Esta copia no contiene un hogar para restaurar. Puedes configurar uno con Comenzar.',
        );
      setPending({ json, backup, name: selected.name });
    } catch (reason) {
      setError(backupError(reason));
    } finally {
      lock.current = false;
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  }
  return (
    <div className={recovery ? 'restore-backup splash-recovery' : 'restore-backup'}>
      <Button
        type="button"
        disabled={disabled || busy}
        variant="secondary"
        onClick={() => file.current?.click()}
      >
        {recovery ? 'Restaurar copia de seguridad' : '📥 Importar copia de seguridad'}
      </Button>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        aria-label="Archivo de respaldo"
        className="sr-only"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (selected) void readFile(selected);
        }}
      />
      {busy && <p role="status">Procesando copia…</p>}
      <ErrorNotice message={error} />
      {pending && (
        <FormDialog title="Restaurar copia de seguridad" onClose={cancel}>
          <AsyncForm
            label={family ? 'Reemplazar datos e importar' : 'Restaurar y entrar'}
            onCancel={cancel}
            onSave={async () => {
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              try {
                await importBackup(pending.json, true);
                setPending(null);
                void navigate('/', { replace: true });
              } catch (reason) {
                throw new Error(backupError(reason), { cause: reason });
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <p className="backup-filename">
              <b>{pending.name}</b>
            </p>
            <p>
              Hogar: <b>{pending.backup.family?.name ?? 'Sin hogar'}</b>. Copia versión{' '}
              {pending.backup.version}.
            </p>
            <p>
              {pending.backup.incomes.length} ingresos, {pending.backup.expenses.length} gastos,{' '}
              {pending.backup.expenseCategories.length} categorías, {pending.backup.debts.length}{' '}
              deudas y {pending.backup.debtPayments.length} pagos.
            </p>
            <p>
              {pending.backup.savingsGoals.length} metas,{' '}
              {pending.backup.savingsTransactions.length} aportes/retiros,{' '}
              {pending.backup.transactions.length} movimientos y {pending.backup.budgets.length}{' '}
              presupuestos. Configuración:{' '}
              {pending.backup.settings ? 'incluida' : 'sin configuración guardada'}.
            </p>
            <p className="reserve-note">
              {family
                ? 'Esta acción reemplaza los datos actuales por los de la copia. Exporta primero si quieres conservarlos.'
                : 'Se restaurarán el hogar y los datos de esta copia. Cualquier dato local existente será reemplazado. No necesitas crear un hogar nuevo.'}
            </p>
          </AsyncForm>
        </FormDialog>
      )}
    </div>
  );
}
