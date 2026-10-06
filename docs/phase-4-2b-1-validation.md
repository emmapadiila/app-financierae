# Fase 4.2B-1 — Edición y eliminación por alcance

Fecha: 2026-10-05. Base: `aef288552af893db4d9df4a62529281b6deb3be6`.
Trabajo sin commit ni push, pendiente de revisión.

## Alcance y auditoría

Se dividió 4.2B según la autorización del punto 16 de la solicitud. Se entrega únicamente
4.2B-1: edición y eliminación por alcance. Pausa/reactivación y fecha final opcional quedan
para 4.2B-2. No se implementaron ni se ejecutaron escenarios de esas funciones pendientes.

La auditoría comprendió Expense, financial.ts, materialización, movementActions,
MovementEditor, formulario de movimientos, repositorios, FinanceDatabase, calendario,
Dashboard, presupuesto, reportes, respaldo y pruebas de 4.2A.

El gasto origen y su transacción representan información financiera real y, a la vez,
la configuración de la recurrencia. Las ocurrencias usan recurrenceSourceId y
recurrenceMonth; omittedMonths pertenece al origen. Los cálculos usan Expense, el
historial usa sus transacciones. El respaldo contiene ambos. Por ello la configuración
debe evolucionar sin sobrescribir el importe ni la fecha históricos del origen.

## Modelo y decisiones de historial

Se mantienen el store transactions, su ID de origen y las excepciones de 4.2A. Se añaden
campos opcionales a details del origen:

- recurrenceBase: nombre, importe, día mensual y mes inicial de la regla, independiente
  del gasto histórico. Se captura al gestionar la regla o editar solo el origen.
- recurrenceChanges: revisiones ordenadas con fromMonth, nombre, importe y día mensual.
  La materialización utiliza la última revisión vigente para cada mes.
- recurrenceStoppedFrom: primer mes que ya no se genera tras eliminar por alcance.
  Es un límite de cancelación; no constituye una UI de fecha final ni de pausa.

No se crean nuevas series con otros IDs ni transacciones ficticias. Las revisiones
conservan una identidad de serie estable y no copian metadata de configuración a hijos.

### Solo este gasto

La edición actualiza gasto y transacciones asociadas. No modifica otros meses ni la regla.
La ocurrencia materializada es el override: no hace falta duplicarla en otra colección.
Se conserva recurrenceMonth; en registros antiguos se captura el vencimiento antes de
cambiar la fecha. Materializar nuevamente no sobrescribe registros existentes.

Eliminar una ocurrencia utiliza la lógica existente de omittedMonths de 4.2A.

### Este y los siguientes

Se guarda una revisión efectiva desde el período estable seleccionado. Se reemplazan las
revisiones posteriores a ese punto y se mantienen las anteriores. Se actualizan nombre,
importe y día de los cargos generados pendientes del alcance, incluidos ajustes
individuales anteriores; esto se explica en la confirmación. No cambian el origen,
los períodos anteriores ni los cargos pagados. Para corregir un pago se usa Solo este gasto.

Eliminar registra recurrenceStoppedFrom y elimina los cargos generados pendientes del
alcance junto con sus transacciones. Conserva pagos, origen y períodos anteriores.
No necesita enumerar infinitos omittedMonths. Materializar nunca rellena meses cancelados.

### Toda la serie

Gestiona la regla desde el mes actual (o desde su inicio si es posterior), con las mismas
garantías para pagos y origen. No reescribe retroactivamente meses anteriores ni siquiera
para renombrarlos. El editor muestra expresamente este significado antes de guardar.
Eliminar toda la serie detiene generaciones y retira cargos generados pendientes desde
ese punto; no borra el origen ni pagos históricos.

El origen se conserva incluso cuando esté pendiente. Al abrir el origen se puede editar
solo su movimiento o gestionar Toda la serie; la eliminación desde ese diálogo siempre
gestiona la serie. Una ocurrencia generada ofrece los tres alcances.
La API heredada de dos argumentos mantiene el borrado simple original usado por las
pruebas de 4.2A; la nueva UI no usa ese borrado simple para eliminar el origen.

Las operaciones guardan regla, gastos y transacciones en una transacción IndexedDB.
Se leen referencias persistidas, se valida pertenencia al hogar y se rechazan snapshots
obsoletos o relaciones inconsistentes. Los fallos revierten todas las escrituras.

## Fechas, IndexedDB y respaldo

El día mensual admitido es 1–31. Si falta en el mes destino se usa su último día, conservando
el día deseado en la regla: 31 → febrero 28/29 → marzo 31. No se permite desbordar al mes
siguiente. Se probaron 28, 29, 30, 31, años bisiestos y diciembre/enero.

IndexedDB continúa en versión 1: no hay stores ni índices nuevos. Los campos opcionales
no requieren migración destructiva. Los registros anteriores se leen sin reescritura.

El backup continúa en versión 1. Exporta/importa la metadata con las transacciones.
Los validadores rechazan días inválidos, revisiones desordenadas/duplicadas, revisiones
sin base, meses anteriores al inicio y configuración en tipos de registro incorrectos.
Los respaldos antiguos siguen aceptándose. No se garantiza lectura de nuevos respaldos
por aplicaciones antiguas con validadores estrictos.

## Pruebas y correcciones

30 pruebas nuevas en recurrenceScopes.test.ts; suite completa: 190 pruebas aprobadas en
14 archivos. Se mantienen las 160 anteriores, incluidas las 27 de 4.2A y las de onboarding
y createId. Cobertura nueva: alcance individual y posterior, revisiones sucesivas,
regeneración, conservación de pagos e historial, cambios de día, aislamiento, referencias
persistidas, rollback al editar/eliminar, calendario/cálculos, respaldo/restauración vacía,
registros anteriores y validación de metadata.

Regresiones detectadas y corregidas:

1. Validar la existencia de una fila de ledger bloqueaba registros ordinarios antiguos
   mostrados mediante movementHistory. Se conserva ese adaptador para edición/borrado
   individual y se añadieron pruebas para ingresos y gastos sin ledger.
2. Una ocurrencia antigua sin recurrenceMonth, pagada en otro mes, podía duplicarse si se
   identificaba por la fecha del movimiento. Materializar usa su vencimiento como respaldo.
3. Editar solo el gasto origen podía cambiar implícitamente generaciones futuras. Se
   captura recurrenceBase antes de actualizar su movimiento financiero.

Validaciones finales:

- npm.cmd test: 190/190 aprobadas.
- npm.cmd run lint: aprobado.
- npm.cmd run typecheck: aprobado.
- npm.cmd run build: aprobado, 193 módulos.

## Navegador real

Chrome headless con perfiles aislados; los datos reales del usuario no se utilizan.

- recurrenceScopes.mjs en loopback: 8 escenarios aprobados.
- recurrenceScopes.mjs mediante MFF_NETWORK_HOST=192.168.1.73: los mismos 8 aprobados.
- recurrenceExceptions.mjs: 4 escenarios de 4.2A aprobados.
- recovery.mjs: 5 escenarios de Fase 4.1 aprobados.
- fullApp.mjs: 7 escenarios generales aprobados, incluido onboarding.

Los ocho escenarios nuevos verifican creación desde formulario, edición individual y
recarga, edición desde un mes con comparación anterior/actual/posterior, eliminación
individual, eliminación desde un mes, cálculos/pantallas sin el gasto omitido, reinicio
completo de Chrome, edición y cancelación total, y JSON exportado restaurado desde Splash
en una instalación vacía. Después de restaurar se materializan explícitamente meses
posteriores para comprobar tanto revisiones como excepciones y límite de cancelación.
La preparación del hogar y el avance de meses utilizan los servicios reales desde el
navegador; las acciones del editor, exportación y restauración se realizan por UI.

Se comprobó http://192.168.1.73:4185 desde el mismo equipo, con isSecureContext=false,
randomUUID=undefined y getRandomValues=function. No se simula crypto. No es una prueba
en un teléfono físico. No se añadieron llamadas directas a randomUUID en producción.

Los nuevos recorridos registran cero errores de consola/runtime. Los diálogos se probaron
a 320, 390, 768 y 1280 px. No hay scroll horizontal de página ni diálogo; los botones se
alcanzan con desplazamiento vertical. Se inspeccionaron capturas de edición móvil y
confirmación de eliminación en escritorio. Se reutilizan FormDialog, AsyncForm y controles
existentes; no se cambió CSS ni se rediseñó la pantalla.

## Archivos

Modificados:
- src/app/services/financeWorkspace.ts
- src/app/services/movementActions.ts
- src/domain/models/financial.ts
- src/features/transactions/components/MovementEditor.tsx

Nuevos:
- src/domain/models/recurrence.ts
- tests/recurrenceScopes.test.ts
- tests/browser/recurrenceScopes.mjs
- docs/phase-4-2b-1-validation.md

Artefactos en tests/browser/artifacts y perfiles/descargas en node_modules/.cache,
ignorados por Git.

## Punto de parada

4.2B-1 queda lista para revisión. Faltan pausa/reactivación y fecha final configurable
(4.2B-2); no hay botones simulados para ellas. Tampoco se implementaron recurrencias de
ingresos ni otras funcionalidades fuera de alcance. No se reconstruyen eliminaciones
anteriores a 4.2A ni fechas históricas que ya se hubieran perdido.
