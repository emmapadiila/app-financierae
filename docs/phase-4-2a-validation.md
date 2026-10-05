# Fase 4.2A — Excepciones de gastos recurrentes

Validación: 2026-10-05. Base: `33aefde7f1244cebeccdc359701cb381f410afe7`.
Sin commit ni push de esta fase.

## Auditoría del trabajo existente

Los cuatro archivos de producción y los dos archivos de pruebas ya estaban pendientes al
retomar esta fase. Contenían el modelo opcional de excepciones, eliminación atómica,
consulta durante materialización, texto de confirmación y 26 pruebas automatizadas.
No se encontró un cambio de producción adicional necesario para el alcance solicitado.
Se conservó esa implementación. Faltaba validar el estado posterior al arreglo de IDs,
probar el host de red y verificar la creación de la serie desde el formulario.

Se amplió el navegador existente para crear la serie por UI, admitir `MFF_NETWORK_HOST`
y registrar las capacidades criptográficas reales. Se añadió una prueba de dos hogares
con series de igual nombre e importe y excepciones independientes, comprobando también
que todos los movimientos de gasto restantes tienen una entidad asociada.

## Causa y solución

La materialización reconocía una ocurrencia por su movimiento existente. Al borrar gasto
y movimiento desaparecía esa evidencia, por lo que el siguiente recorrido la regeneraba.

Ahora la transacción origen conserva `details.omittedMonths`, una lista única de meses
`YYYY-MM`. La identidad es `familyId` + `id` de la transacción origen + mes. Una ocurrencia
generada referencia ese origen mediante `recurrenceSourceId` y conserva `recurrenceMonth`
para que una fecha de pago posterior no cambie su identidad.

La eliminación consulta relaciones persistidas, valida el hogar y la serie, agrega la
excepción y elimina el gasto y todos sus movimientos vinculados en una misma transacción
IndexedDB. Un fallo revierte toda la operación. La materialización omite esos meses.
La metadata no constituye un movimiento financiero adicional.

Gastos normales mantienen su eliminación normal. El origen y las otras ocurrencias se
conservan al eliminar una ocurrencia. No se introduce nueva UX de eliminación de series.

## Persistencia y respaldo

Son campos opcionales dentro de registros del store `transactions` existente. No hay
nuevos stores, índices ni cambios en la versión Dexie: continúa en 1. No se necesita
migración. Se verificó la reapertura de registros anteriores sin pérdida y la eliminación
de una ocurrencia antigua sin `recurrenceMonth`, usando su mes de vencimiento.

El respaldo ya exporta las transacciones completas. La validación del dominio acepta los
campos nuevos y rechaza meses inválidos, duplicados o metadata en tipos de registro
incorrectos. El formato sigue en versión 1 y los respaldos antiguos se restauran sin
transformación. Se verificó exportación real y restauración desde Splash en un perfil vacío.

Compatibilidad comprobada: esta versión lee respaldos versión 1 anteriores y actuales.
No se garantiza que binarios antiguos lean metadata nueva: sus validadores estrictos
pueden rechazarla.

## Validaciones ejecutadas

- `npm.cmd test`: 160 pruebas aprobadas en 13 archivos; 27 son de excepciones recurrentes.
- `npm.cmd run lint`: aprobado.
- `npm.cmd run typecheck`: aprobado.
- `npm.cmd run build`: aprobado, 192 módulos.
- `git diff --check`: sin errores de whitespace.
- Búsqueda en `src`: la única invocación de `randomUUID` está dentro de `createId`, protegida
  por comprobación de disponibilidad.

Las pruebas cubren rematerialización repetida, meses anteriores y posteriores, gastos
normales, aislamiento entre hogares y series de igual nombre/importe, referencias de UI
manipuladas, transacciones relacionadas, ausencia en cálculos/historial/calendario,
varias excepciones, diciembre/enero, días 28–31 y febrero bisiesto, fallos con rollback,
eliminaciones concurrentes, reinicio de sesión/base, respaldo y compatibilidad anterior.

Navegador Chrome real en modo headless, con perfiles aislados:

- `node tests/browser/recurrenceExceptions.mjs`: 4 escenarios aprobados en loopback.
- `$env:MFF_NETWORK_HOST='192.168.1.73'; node tests/browser/recurrenceExceptions.mjs`:
  los mismos 4 escenarios aprobados por `http://192.168.1.73:4184`.
- `node tests/browser/recovery.mjs`: 5 escenarios aprobados de Fase 4.1.

Los cuatro escenarios de excepciones comprueban:

1. Crear la serie desde Nuevo gasto, ver y eliminar la ocurrencia en Movimientos,
   recargar y confirmar que no reaparece; el mes siguiente sigue visible.
2. Dashboard, Movimientos, Calendario, Presupuesto y Reportes excluyen la ocurrencia.
3. Cerrar Chrome y abrir el mismo perfil conserva la excepción con nueva FinanceSession.
4. Exportar JSON desde Respaldo, restaurarlo desde Splash en otro perfil vacío, entrar al
   Dashboard y recargar conserva la omisión durante la materialización posterior.

El hogar inicial se prepara con servicios reales; la materialización del mes futuro se
invoca explícitamente con esos servicios. Creación del gasto, eliminación, navegación,
exportación y restauración se realizan mediante UI.

En el host de red se comprobó `isSecureContext: false`, `randomUUID: undefined` y
`getRandomValues: function`, sin simular ni sobrescribir crypto. Es acceso por IP desde
el mismo equipo, no una prueba en un teléfono físico.

Los recorridos de excepciones registraron cero errores de consola/runtime. El diálogo
no tuvo desbordamiento a 320, 390, 768 y 1280 px; se inspeccionaron visualmente las
capturas de 320 y 1280 px. Se conserva el diseño existente.

El primer intento restringido de Chrome agotó el tiempo en `Page.enable` antes de probar
la aplicación. La ejecución posterior con permisos para Chrome/Vite completó el flujo.
No se modificaron assertions para ocultar fallos.

## Archivos de esta fase

- `src/app/services/financeWorkspace.ts`
- `src/app/services/movementActions.ts`
- `src/domain/models/financial.ts`
- `src/features/transactions/components/MovementEditor.tsx`
- `tests/recurrenceExceptions.test.ts` (nuevo)
- `tests/browser/recurrenceExceptions.mjs` (nuevo)
- `docs/phase-4-2a-validation.md` (nuevo)

Perfiles y archivos temporales quedan en `node_modules/.cache`; resultados y capturas
en `tests/browser/artifacts`, ambos ignorados por Git.

## Límites

No se pueden reconstruir eliminaciones realizadas antes de registrar excepciones.
Las ocurrencias antiguas sin período estable usan el vencimiento que aún conservan;
no se infieren fechas originales que hayan sido alteradas previamente.
Eliminar el origen conserva el comportamiento anterior: detiene nuevas generaciones
y mantiene las ocurrencias ya creadas. No se agregó editor avanzado de series, pausa,
reactivación, fecha final ni otras funcionalidades fuera de Fase 4.2A.
