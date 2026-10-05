import { useState } from 'react';
import type { FinancialTransaction } from '../../../domain/models/financial';
import { useFinance } from '../../../app/state/financeContext';
import { FormDialog } from '../../../components/ui/FormDialog';
import { AsyncForm } from '../../../components/ui/AsyncForm';
import { Field } from '../../../components/ui/Controls';
import { CurrencyInput } from '../../../components/ui/CurrencyInput';

export function MovementEditor({
  movement,
  onClose,
}: {
  movement: FinancialTransaction;
  onClose: () => void;
}) {
  const { app } = useFinance();
  const [name, setName] = useState(movement.description);
  const [amount, setAmount] = useState(String(movement.amount));
  const [date, setDate] = useState(movement.date);
  const [remove, setRemove] = useState(false);
  return (
    <FormDialog title={remove ? 'Eliminar movimiento' : 'Editar movimiento'} onClose={onClose}>
      <AsyncForm
        label={remove ? 'Confirmar eliminación' : 'Guardar cambios'}
        onCancel={onClose}
        onSave={async () => {
          if (!app) return;
          await app.services.movements.change(
            movement,
            remove ? null : { name, amount: Number(amount), date },
          );
          onClose();
        }}
      >
        {remove ? (
          <p>
            {movement.details?.recurrenceSourceId
              ? `Se eliminará únicamente esta ocurrencia de «${movement.description}». Ese período no volverá a generarse. La serie y las demás ocurrencias se conservarán.`
              : `Se eliminará «${movement.description}» y se actualizarán los totales. Los gastos recurrentes ya generados se conservarán.`}
          </p>
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
            <Field
              label="Fecha"
              type="date"
              value={date}
              required
              onChange={(e) => setDate(e.target.value)}
            />
            <button type="button" className="text-link danger" onClick={() => setRemove(true)}>
              Eliminar movimiento
            </button>
          </>
        )}
      </AsyncForm>
    </FormDialog>
  );
}
