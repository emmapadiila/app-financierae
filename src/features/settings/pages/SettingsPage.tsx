import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFinance } from '../../../app/state/financeContext';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Card, Field } from '../../../components/ui/Controls';
import { AsyncForm } from '../../../components/ui/AsyncForm';
import { FormDialog } from '../../../components/ui/FormDialog';
import { formatDate } from '../../../shared/utils/presentation';

function ProfileEditor({ onClose }: { onClose: () => void }) {
  const { family, app } = useFinance();
  const [name, setName] = useState(family!.name);
  return (
    <FormDialog title="Mi hogar" onClose={onClose}>
      <AsyncForm
        onCancel={onClose}
        onSave={async () => {
          await app!.services.family.update({ name, currency: family!.currency });
          onClose();
        }}
      >
        <Field
          label="Nombre del hogar"
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </AsyncForm>
    </FormDialog>
  );
}
export function SettingsPage() {
  const { data, app, family, dark, toggleTheme } = useFinance();
  const [profile, setProfile] = useState(false);
  const [currency, setCurrency] = useState(false);
  const [selected, setSelected] = useState(data?.settings?.currency ?? family?.currency ?? 'COP');
  if (!data || !app || !family) return null;
  return (
    <AppShell>
      <PageHeader title="Configuración" />
      <main id="main" className="page-content space-y-4">
        <Card className="settings-link">
          <span className="avatar">{family.name.slice(0, 2).toUpperCase()}</span>
          <span>
            <b>{family.name}</b>
            <small>Desde {formatDate(family.createdAt.slice(0, 10))}</small>
          </span>
        </Card>
        <h2 className="settings-heading">Perfil</h2>
        <Card className="settings-rows">
          <button onClick={() => setProfile(true)}>
            <span>🏠 Mi hogar</span>
            <small>{family.name} ›</small>
          </button>
          <button
            onClick={() => {
              setSelected(data.settings?.currency ?? family.currency);
              setCurrency(true);
            }}
          >
            <span>💱 Moneda</span>
            <small>{data.settings?.currency ?? family.currency} ›</small>
          </button>
          <details>
            <summary>🏷️ Categorías · {data.expenseCategories.length}</summary>
            <p className="muted text-sm mt-3">
              {data.expenseCategories.map((c) => c.name).join(' · ') ||
                'Añade categorías al registrar tus gastos.'}
            </p>
          </details>
        </Card>
        <h2 className="settings-heading">Preferencias</h2>
        <Card className="settings-rows">
          <button role="switch" aria-checked={dark} onClick={toggleTheme}>
            <span>🌙 Modo oscuro</span>
            <span className={`theme-switch ${dark ? 'enabled' : ''}`} aria-hidden="true">
              <i />
            </span>
          </button>
          <p className="muted text-xs">La apariencia se guarda en este navegador.</p>
        </Card>
        <h2 className="settings-heading">Datos</h2>
        <Card className="settings-rows">
          <Link to="/backup">
            <span>📤 Exportar copia</span>
            <span>›</span>
          </Link>
          <Link to="/backup">
            <span>📥 Importar copia</span>
            <span>›</span>
          </Link>
          <details>
            <summary>🔒 Privacidad</summary>
            <p className="muted text-sm mt-3">
              Tus datos financieros permanecen en este navegador. No se envían a un servidor.
              Exporta una copia antes de borrar los datos del navegador.
            </p>
          </details>
        </Card>
        <h2 className="settings-heading">Acerca de</h2>
        <Card>
          <h2>Mi Familia Finanzas</h2>
          <p className="muted text-xs mt-2">Organiza hoy. Respira tranquilo mañana.</p>
        </Card>
      </main>
      {profile && <ProfileEditor onClose={() => setProfile(false)} />}
      {currency && (
        <FormDialog title="Moneda de presentación" onClose={() => setCurrency(false)}>
          <AsyncForm
            onCancel={() => setCurrency(false)}
            onSave={async () => {
              await app.services.financialSettings.update({
                currency: selected,
                locale: data.settings?.locale ?? 'es-CO',
                weekStartsOn: data.settings?.weekStartsOn ?? 1,
                ...(data.settings?.debtPlan ? { debtPlan: data.settings.debtPlan } : {}),
              });
              setCurrency(false);
            }}
          >
            <label className="field">
              <span>Moneda</span>
              <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                {['COP', 'USD', 'EUR', 'MXN', 'PEN', 'CLP', 'ARS'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <p className="reserve-note">
              Cambia el símbolo de todos los importes. No convierte los saldos ni aplica tipos de
              cambio.
            </p>
          </AsyncForm>
        </FormDialog>
      )}
    </AppShell>
  );
}
