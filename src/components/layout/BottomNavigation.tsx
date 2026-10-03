import { NavLink, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../ui/Icon';
const destinations: { path: string; label: string; icon: IconName }[] = [
  { path: '/dashboard', label: 'Inicio', icon: 'home' },
  { path: '/transactions', label: 'Movimientos', icon: 'movements' },
  { path: '/debts', label: 'Deudas', icon: 'debt' },
  { path: '/debt-plan', label: 'Plan', icon: 'plan' },
  { path: '/more', label: 'Más', icon: 'menu' },
];
export function BottomNavigation() {
  const { pathname } = useLocation();
  const secondary = [
    '/budget',
    '/savings',
    '/calendar',
    '/reports',
    '/simulator',
    '/settings',
    '/backup',
  ].includes(pathname);
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      <span className="nav-brand">
        Mi Familia
        <br />
        <b>Finanzas</b>
      </span>
      {destinations.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `nav-item ${isActive || (item.path === '/more' && secondary) ? 'active' : ''}`
          }
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
