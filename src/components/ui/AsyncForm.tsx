import { useRef, useState, type ReactNode, type FormEvent } from 'react';
import { Button, ErrorNotice } from './Controls';
import { errorMessage } from '../../shared/utils/presentation';

export function AsyncForm({
  children,
  onSave,
  label = 'Guardar',
  onCancel,
}: {
  children: ReactNode;
  onSave: () => Promise<unknown>;
  label?: string;
  onCancel?: () => void;
}) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await onSave();
      setSaved(true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
      <fieldset disabled={busy} className="space-y-4">
        {children}
        <ErrorNotice message={error} />
        {saved && (
          <p role="status" className="success-notice">
            Cambios guardados.
          </p>
        )}
        <Button type="submit">{busy ? 'Guardando…' : label}</Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </fieldset>
    </form>
  );
}
