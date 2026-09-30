import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
export function FormDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="form-dialog" aria-labelledby={id} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="dialog-content"><div className="section-heading"><h2 id={id}>{title}</h2><button type="button" aria-label="Cerrar formulario" className="icon-button" onClick={onClose}><Icon name="close" /></button></div>{children}</div></dialog>;
}
