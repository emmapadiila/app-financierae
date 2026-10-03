import { Link } from 'react-router-dom';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';

const items = [
  ['📋', 'Presupuesto', 'Controla tus límites', '/budget'],
  ['🐷', 'Ahorros', 'Tus metas de ahorro', '/savings'],
  ['📅', 'Calendario', 'Pagos del mes', '/calendar'],
  ['📊', 'Reportes', 'Analiza tus finanzas', '/reports'],
  ['🎯', 'Simulador', '¿Qué pasaría si...?', '/simulator'],
  ['💾', 'Respaldo', 'Exporta tus datos', '/backup'],
] as const;
export function MorePage() {
  return (
    <AppShell>
      <PageHeader title="Más herramientas">
        <p className="muted text-sm mt-1">Todo para organizar tus finanzas</p>
      </PageHeader>
      <main id="main" className="page-content">
        <div className="tools-grid">
          {items.map(([icon, title, description, path], index) => (
            <Link to={path} key={path} className="card tool-card">
              <span aria-hidden="true" className={`tool-icon tool-color-${index}`}>
                {icon}
              </span>
              <h2>{title}</h2>
              <p className="muted text-xs mt-1">{description}</p>
            </Link>
          ))}
        </div>
        <Link to="/settings" className="card settings-link mt-3">
          <span className="tool-icon" aria-hidden="true">
            ⚙️
          </span>
          <span>
            <b>Configuración</b>
            <small>Preferencias y datos</small>
          </span>
          <span aria-hidden="true">›</span>
        </Link>
      </main>
    </AppShell>
  );
}
