import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { BottomNavigation } from './BottomNavigation';

export function AppShell({ children, navigation = true }: { children: ReactNode; navigation?: boolean }) {
  const location = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [location.pathname]);
  return <div className={`app-shell ${navigation ? 'with-navigation' : ''}`}><a className="skip-link" href="#main">Ir al contenido</a>{children}{navigation && <BottomNavigation />}</div>;
}
export function DeferredLink({ children, className = '' }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className={`text-link ${className}`} onClick={() => setOpen(true)}>{children}</button>{open && <div className="inline-notice" role="status">Esta herramienta estará disponible en una próxima entrega.<button type="button" aria-label="Cerrar aviso" onClick={() => setOpen(false)}><Icon name="close" /></button></div>}</>;
}
export function PendingPage() {
  return <AppShell><main id="main" className="p-6"><h1>Próximamente</h1><p className="muted my-4">Esta herramienta estará disponible en una próxima entrega.</p><Link to="/dashboard" className="button button-primary">Volver al inicio</Link></main></AppShell>;
}
