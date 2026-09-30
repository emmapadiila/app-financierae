import { useId, useRef, useEffect } from 'react';
import { displayCurrencyInput, parseCurrencyInput } from '../../shared/utils/currencyInput';

export function CurrencyInput({ label, value, onChange, prominent = false, min = 0, required = false }: {
  label: string; value: string; onChange: (value: string) => void; prominent?: boolean; min?: number; required?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.setCustomValidity(value && Number(value) < min ? 'Ingresa un valor mayor que cero.' : ''); }, [value, min]);
  return <label className={`money-field ${prominent ? 'money-prominent' : ''}`} htmlFor={id}><span>{label}</span><div><span aria-hidden="true">$</span><input ref={input} id={id} type="text" inputMode="decimal" autoComplete="off" placeholder="0" value={displayCurrencyInput(value)} required={required} onChange={event => { const parsed = parseCurrencyInput(event.target.value); if (parsed !== null) onChange(parsed); }} /></div></label>;
}
