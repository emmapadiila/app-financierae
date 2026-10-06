import { useState } from 'react';
import type { FinancialTransaction } from '../../../domain/models/financial';
import { useFinance } from '../../../app/state/financeContext';
import { FormDialog } from '../../../components/ui/FormDialog';
import { AsyncForm } from '../../../components/ui/AsyncForm';
import { Field } from '../../../components/ui/Controls';
import { CurrencyInput } from '../../../components/ui/CurrencyInput';
import {
  occurrenceMonth,
  recurrenceValues,
  type RecurrenceScope,
} from '../../../domain/models/recurrence';
import { currentMonth } from '../../../shared/utils/dates';

export function MovementEditor({
  movement,
  onClose,
}: {
  movement: FinancialTransaction;
  onClose: () => void;
}) {
  const { app, data } = useFinance();
  const [name, setName] = useState(movement.description);
  const [amount, setAmount] = useState(String(movement.amount));
  const [date, setDate] = useState(movement.date);
  const [remove, setRemove] = useState(false);
  const [scope, setScope] = useState<RecurrenceScope>('single');
  const [day, setDay] = useState(String(Number(movement.date.slice(8))));
  const source = data?.transactions.find(
    (item) =>
      item.id === (movement.details?.recurrenceSourceId ?? movement.id) &&
      item.details?.repeatMonthly &&
      !item.details.recurrenceSourceId,
  );
  const origin = data?.expenses.find((item) => item.id === source?.relatedEntityId);
  const expense = data?.expenses.find((item) => item.id === movement.relatedEntityId);
  const generated = Boolean(movement.details?.recurrenceSourceId);
  const period = expense ? occurrenceMonth(movement, expense) : movement.date.slice(0, 7);
  function selectScope(next: RecurrenceScope) {
    setScope(next);
    if (next === 'single') {
      setName(movement.description);
      setAmount(String(movement.amount));
    } else if (source && origin) {
      const values = recurrenceValues(source, origin, next === 'all' ? currentMonth() : period);
      setName(values.name);
      setAmount(String(values.amount));
      setDay(String(values.day));
    }
  }
  return (
    <FormDialog title={remove ? 'Eliminar movimiento' : 'Editar movimiento'} onClose={onClose}>
      <AsyncForm
        label={remove ? 'Confirmar eliminación' : 'Guardar cambios'}
        onCancel={onClose}
        onSave={async () => {
          if (!app) return;
          await app.services.movements.change(
            movement,
            remove
              ? null
              : {
                  name,
                  amount: Number(amount),
                  date,
                  ...(scope !== 'single' ? { recurrenceDay: Number(day) } : {}),
                },
            scope,
          );
          onClose();
        }}
      >
        {source && (
          <fieldset className="space-y-3">
            <legend className="field-label">
              {remove ? '¿Qué quieres eliminar?' : '¿Qué quieres modificar?'}
            </legend>
            {(!remove || generated) && (
              <label className="checkbox-label">
                <input
                  type="radio"
                  name="recurrence-scope"
                  value="single"
                  checked={scope === 'single'}
                  onChange={() => selectScope('single')}
                />
                <span>
                  Solo este gasto
                  <small className="block muted">
                    Cambia únicamente el movimiento seleccionado.
                  </small>
                </span>
              </label>
            )}
            {generated && (
              <label className="checkbox-label">
                <input
                  type="radio"
                  name="recurrence-scope"
                  value="following"
                  checked={scope === 'following'}
                  onChange={() => selectScope('following')}
                />
                <span>
                  Este y los siguientes
                  <small className="block muted">Desde el período {period} en adelante.</small>
                </span>
              </label>
            )}
            <label className="checkbox-label">
              <input
                type="radio"
                name="recurrence-scope"
                value="all"
                checked={scope === 'all'}
                onChange={() => selectScope('all')}
              />
              <span>
                Toda la serie
                <small className="block muted">Gestiona la recurrencia desde el mes actual.</small>
              </span>
            </label>
            {source.details?.recurrenceStoppedFrom && (
              <p role="status" className="muted text-sm">
                Serie finalizada desde {source.details.recurrenceStoppedFrom}.
              </p>
            )}
          </fieldset>
        )}
        {scope !== 'single' && (
          <p className="reserve-note">
            {remove
              ? 'Se detendrá la recurrencia y se eliminarán los cargos pendientes del alcance elegido. Se conservan el gasto origen, los períodos anteriores y todos los gastos pagados.'
              : 'Se cambiarán nombre, valor y día mensual de los cargos pendientes del alcance elegido, incluidos sus ajustes individuales. Se conservan el gasto origen, los períodos anteriores y todos los gastos pagados. Los meses omitidos siguen omitidos.'}
          </p>
        )}
        {remove ? (
          scope === 'single' ? (
            <p>
              {movement.details?.recurrenceSourceId
                ? `Se eliminará únicamente esta ocurrencia de «${movement.description}». Ese período no volverá a generarse. La serie y las demás ocurrencias se conservarán.`
                : `Se eliminará «${movement.description}» y se actualizarán los totales. Los gastos recurrentes ya generados se conservarán.`}
            </p>
          ) : (
            <p>
              Confirma que deseas detener esta recurrencia con el alcance seleccionado. Esta acción
              no borra los pagos históricos.
            </p>
          )
        ) : (
          <>
            <Field
              label="Nombre"
              value={name}
              maxLength={120}
              required
              onChange={(e) => setName(e.target.value)}
            />
            <CurrencyInput label="Valor" value={amount} onChange={setAmount} required min={0.01} />
            {scope === 'single' ? (
              <Field
                label="Fecha"
                type="date"
                value={date}
                required
                onChange={(e) => setDate(e.target.value)}
              />
            ) : (
              <Field
                label="Día mensual"
                type="number"
                value={day}
                min={1}
                max={31}
                step={1}
                required
                onChange={(e) => setDay(e.target.value)}
              />
            )}
            {scope !== 'single' && (
              <p className="muted text-sm">
                Si ese día no existe, se usará el último día del mes. La serie conserva el día
                elegido.
              </p>
            )}
            <button
              type="button"
              className="text-link danger"
              onClick={() => {
                setRemove(true);
                if (source && !generated) selectScope('all');
              }}
            >
              Eliminar movimiento
            </button>
          </>
        )}
      </AsyncForm>
    </FormDialog>
  );
}
