# Cierre de Fase 2

El cierre valida el núcleo local existente. El commit previo `201d8bc` ya contiene
interfaz; este cierre no añade pantallas ni continúa su desarrollo. Los cambios
puntuales en componentes eliminan acceso a almacenamiento y un error de ESLint.

## Correcciones

- DebtPlanner rechaza identificadores duplicados antes de construir sus mapas.
- El orden personalizado se valida contra todas las deudas recibidas; las
  saldadas se excluyen después de ordenar, sin invalidar un orden completo.
- DebtSimulator rechaza reducciones mayores que los gastos actuales y excluye
  las cuotas de deudas saldadas del dinero reservado.
- FinanceSession concentra observación y conexión a IndexedDB. React recibe
  operaciones y snapshots, sin bases ni repositorios.
- Se elimina una mutación local señalada por ESLint en el gráfico preexistente.
- El build separa Dexie/Zod en un chunk de almacenamiento y validación, sin
  aumentar el umbral del aviso de tamaño ni añadir dependencias.

No se cambiaron expectativas de las 27 pruebas originales.

## Verificación

| Suite                        |  Casos | Alcance                                                                                                       |
| ---------------------------- | -----: | ------------------------------------------------------------------------------------------------------------- |
| financialCalculators.test.ts |     17 | BudgetCalculator, frecuencias de ingresos, tres estrategias, simulador, ahorro y resumen                      |
| financeServices.test.ts      |      6 | CRUD de ingresos, validación de fechas, gastos, pagos y ahorro                                                |
| backup.test.ts               |      4 | JSON, versión, referencias, confirmación y reemplazo                                                          |
| coreCompletion.test.ts       |     20 | CRUD de gastos, aislamiento, concurrencia, rollback, restauración completa, persistencia y límites de cálculo |
| financeSession.test.ts       |      2 | Sesión sin React, observación y operaciones sin conexión expuesta                                             |
| architecture.test.ts         |      2 | Grafo de dependencias del núcleo y prohibición de almacenamiento en componentes                               |
| **Total**                    | **51** | **27 originales + 24 nuevas**                                                                                 |

Comandos de cierre: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
Las pruebas automatizadas de almacenamiento usan fake-indexeddb y reabren la
conexión con la misma base. También se ejecutó una comprobación independiente
con IndexedDB nativo en Chrome, perfil aislado y reinicio completo del proceso:
se conservaron ingreso, gasto, pago, saldo de deuda y ahorro. No se usó la base
del usuario para esa comprobación.

La restauración se verifica sobre las once tablas, con comparación completa de
registros tras exportar, borrar, importar y reabrir. Los fallos simulados de
escritura demuestran rollback de restauraciones, pagos y aportes. Los pagos
simultáneos conservan el saldo correcto y los retiros concurrentes no sobregiran.

## Contratos y límites existentes

- Una familia por dispositivo. Almacenamiento local, sin sincronización remota.
- Los saldos de deuda y ahorro no pueden ser negativos; el disponible de un
  presupuesto sí puede ser negativo para reflejar un déficit real.
- Un sobrepago conserva el importe registrado y limita el saldo de deuda a cero,
  de acuerdo con el contrato y la prueba originales; no genera un saldo a favor.
- Los ingresos semanales y cada dos semanas se normalizan a un promedio mensual.
- Las proyecciones usan tasas y cuotas proporcionadas; no son cuadros bancarios
  de amortización ni garantizan una fecha real de liquidación.
- Las pantallas preexistentes no se validan visualmente ni se amplían en este cierre.

Dependencias añadidas en este cierre: ninguna.
