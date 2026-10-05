import { Link } from 'react-router-dom';
import { useFinance } from '../../../app/state/financeContext';
import { RestoreBackup } from '../../backup/components/RestoreBackup';
import { Icon } from '../../../components/ui/Icon';

export function SplashPage() {
  const { family } = useFinance();
  return (
    <main id="main" className="splash">
      <div className="splash-content">
        <div className="brand-mark">
          <span className="brand-house">
            <Icon name="home" />
            <b>$</b>
          </span>
        </div>
        <h1>
          Mi Familia
          <br />
          <span>Finanzas</span>
        </h1>
        <p>
          Organiza hoy. Respira tranquilo
          <br />
          mañana.
        </p>
        <div className="splash-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="splash-footer">
        <Link className="button splash-button" to={family ? '/dashboard' : '/onboarding'}>
          {family ? 'Ir a mis finanzas' : 'Comenzar'} <span aria-hidden="true">→</span>
        </Link>
        {!family && <RestoreBackup recovery />}
        <p>Sin registro. Sin conexión a tu banco. Solo tú.</p>
      </div>
    </main>
  );
}
