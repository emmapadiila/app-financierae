import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../ui/Icon';
import { Button } from '../ui/Controls';

const destinations: { to: string; label: string; icon: IconName; ready: boolean }[] = [
  { to: '/dashboard', label: 'Inicio', icon: 'home', ready: true },
  { to: '/transactions', label: 'Movimientos', icon: 'movements', ready: true },
  { to: '/debts', label: 'Deudas', icon: 'debt', ready: false },
  { to: '/debt-plan', label: 'Plan', icon: 'plan', ready: false },
  { to: '/more', label: 'Más', icon: 'menu', ready: false },
];
export function AppShell({ children, navigation = true }: { children: ReactNode; navigation?: boolean }) {
  const location = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [location.pathname]);
  return <div className={`app-shell ${navigation ? 'with-navigation' : ''}`}><a className="skip-link" href="#main">Ir al contenido</a>{children}{navigation && <nav className="bottom-nav" aria-label="Navegación principal">{destinations.map(item => item.ready ? <NavLink key={item.to} to={item.to} end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon name={item.icon} /><span>{item.label}</span></NavLink> : <span className="nav-item" key={item.to}><button type="button" disabled title={`${item.label}: próximo bloque`} aria-label={`${item.label}, próximo bloque`}><Icon name={item.icon} /><span>{item.label}</span></button></span>)}</nav>}</div>;
}
export function DeferredLink({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="text-link" onClick={() => setOpen(true)}>{children}</button>{open && <div className="inline-notice" role="status">Esta pantalla se implementará en el siguiente bloque.<button type="button" aria-label="Cerrar aviso" onClick={() => setOpen(false)}><Icon name="close" /></button></div>}</>;
}
export function PendingPage() {
  return <AppShell><main id="main" className="p-6"><h1>Pantalla pendiente</h1><p className="muted my-4">Este bloque incluye Inicio y Movimientos. Las demás herramientas se implementarán después.</p><Link to="/dashboard"><Button>Volver al inicio</Button></Link></main></AppShell>;
}
