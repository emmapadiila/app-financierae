import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from '../ui/Icon';
const destinations: { label: string; icon: IconName }[] = [{ label: 'Más', icon: 'menu' }];
export function BottomNavigation() {
  const [notice, setNotice] = useState('');
  return <><nav className="bottom-nav" aria-label="Navegación principal"><NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} end><Icon name="home" /><span>Inicio</span></NavLink><NavLink to="/transactions" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><Icon name="movements" /><span>Movimientos</span></NavLink><NavLink to="/debts" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><Icon name="debt" /><span>Deudas</span></NavLink><NavLink to="/debt-plan" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><Icon name="plan" /><span>Plan</span></NavLink>{destinations.map(item => <button key={item.label} type="button" className="nav-item" aria-label={`${item.label}: próximamente`} onClick={() => setNotice(`${item.label} estará disponible en una próxima entrega.`)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>{notice && <div role="status" className="inline-notice"><span>{notice}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><Icon name="close" /></button></div>}</>;
}
