import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFinance } from '../../../app/state/financeContext';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Card, Button, ErrorNotice } from '../../../components/ui/Controls';
import { RestoreBackup } from '../components/RestoreBackup';
import { errorMessage } from '../../../shared/utils/presentation';

export function BackupPage() {
  const { app } = useFinance();
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
        <RestoreBackup disabled={busy} />
        {busy && <p role="status">Procesando copia…</p>}
        <ErrorNotice message={error} />
        <p className="reserve-note">
          Exporta una copia periódicamente para conservar tus datos si cambias de dispositivo.
        </p>
      </main>
    </AppShell>
  );
}
