import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFinance } from '../../../app/state/financeContext';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Card, Button, ErrorNotice } from '../../../components/ui/Controls';
import { FormDialog } from '../../../components/ui/FormDialog';
import { AsyncForm } from '../../../components/ui/AsyncForm';
import { parseFinanceBackup, type FinanceBackup } from '../services/financeBackup';
import { errorMessage } from '../../../shared/utils/presentation';

export function BackupPage() {
  const { app } = useFinance();
  const navigate = useNavigate();
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{
    json: string;
    backup: FinanceBackup;
    name: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState('');
  async function exportCopy() {
    if (!app || busy) return;
    setBusy(true);
    setError('');
    try {
      const backup = await app.services.exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mi-familia-finanzas-${backup.exportedAt.slice(0, 10)}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setLast(
        `${new Date(backup.exportedAt).toLocaleString('es-CO')} · ${(blob.size / 1024).toFixed(1)} KB`,
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  async function readFile(selected: File) {
    setError('');
    setBusy(true);
    try {
      const json = await selected.text();
      const backup = parseFinanceBackup(json);
      setPending({ json, backup, name: selected.name });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  }
  return (
    <AppShell>
      <PageHeader title="Tus datos">
        <Link to="/more" className="text-link">
          ← Más
        </Link>
      </PageHeader>
      <main id="main" className="page-content space-y-4">
        <Card className="privacy-card">
          <h2>🔐 Tu información es tuya</h2>
          <p className="text-sm mt-2">
            Tu información financiera permanece almacenada únicamente en este navegador. No se
            comparte con ningún servidor externo.
          </p>
        </Card>
        <Card>
          <p className="muted text-xs">Última exportación de esta sesión</p>
          <p className="mt-2" role="status">
            {last || 'Aún no has exportado una copia en esta sesión.'}
          </p>
          {last && (
            <p className="muted text-xs mt-2">
              Descarga solicitada. Comprueba que el archivo se guardó.
            </p>
          )}
        </Card>
        <Button disabled={busy} onClick={() => void exportCopy()}>
          📤 Exportar copia de seguridad
        </Button>
        <Button disabled={busy} variant="secondary" onClick={() => file.current?.click()}>
          📥 Importar copia de seguridad
        </Button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          aria-label="Archivo de respaldo"
          className="sr-only"
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) void readFile(selected);
          }}
        />
        {busy && <p role="status">Procesando copia…</p>}
        <ErrorNotice message={error} />
        <p className="reserve-note">
          Exporta una copia periódicamente para conservar tus datos si cambias de dispositivo.
        </p>
      </main>
      {pending && (
        <FormDialog title="Restaurar copia de seguridad" onClose={() => setPending(null)}>
          <AsyncForm
            label="Reemplazar datos e importar"
            onCancel={() => setPending(null)}
            onSave={async () => {
              await app!.services.importBackup(pending.json, true);
              setPending(null);
              void navigate('/', { replace: true });
            }}
          >
            <p>
              <b>{pending.name}</b>
            </p>
            <p>
              Hogar: {pending.backup.family?.name ?? 'Sin hogar'}. {pending.backup.expenses.length}{' '}
              gastos, {pending.backup.debts.length} deudas y {pending.backup.savingsGoals.length}{' '}
              metas.
            </p>
            <p className="error-notice">
              Esta acción reemplaza los datos actuales por los de la copia. Exporta primero si
              quieres conservarlos.
            </p>
          </AsyncForm>
        </FormDialog>
      )}
    </AppShell>
  );
}
