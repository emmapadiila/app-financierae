# Fase 4.1 — Restauración desde una instalación vacía

Fecha: 5 de octubre de 2026. Alcance exclusivo: recuperar una copia JSON desde Splash sin crear un hogar temporal. Sin commit ni push.

## Implementación

Splash conserva su diseño y su acción Comenzar. Añade Restaurar copia de seguridad como acción secundaria. El nuevo componente RestoreBackup comparte selección, validación, vista previa, confirmación, estados de procesamiento y errores con BackupPage.

FinanceSession expone importBackup sin requerir familyId. FinanceProvider y el contexto publican esa operación; llama al mismo importFinanceBackup utilizado por la aplicación existente. La suscripción liveQuery reconoce el hogar restaurado y el router existente entra al Dashboard sin recarga manual.

No se modificaron financeBackup, los esquemas, FinanceDatabase, createFinanceApplication, AppRouter ni las reglas financieras. Se reutilizan parseFinanceBackup, importFinanceBackup, los repositorios Dexie, FormDialog, AsyncForm, Button y ErrorNotice. No hay un segundo motor de importación.

## Integridad

La selección del archivo solo lee y valida; cancelar no escribe. La confirmación vuelve a pasar por el validador del servicio. El borrado y las escrituras permanecen dentro de la transacción existente de las 11 tablas. Un error revierte la operación completa. Se comprobaron fallos reales de escritura dentro de fake-indexeddb y de IndexedDB en Chrome.

Los mensajes distinguen JSON corrupto, versión incompatible y datos/referencias inválidos. Una copia sin hogar no permite iniciar una recuperación desde Splash. La validación se basa en el contenido del archivo, no únicamente en su extensión.

## Pruebas

- 19 pruebas nuevas en emptyInstallationRecovery.test.ts, con fixture reutilizable basado en mockFinanceData.
- Cobertura: instalación vacía, las 11 colecciones, hogar e identificadores originales, errores JSON/esquema/versión/referencias, observación reactiva, reapertura de sesión, rollback con y sin datos existentes, confirmación y compatibilidad del servicio anterior.
- Suite completa: 126 pruebas aprobadas en 11 archivos.
- Lint, typecheck y build de producción aprobados.
- Navegador existente: bloque A 6 escenarios, B 7, C 6 y fullApp 7; todos aprobados.
- Nuevo recovery.mjs: 5 escenarios aprobados. Total de escenarios de navegador: 31.

## Navegador y diseño

Chrome real mediante CDP y perfiles de prueba aislados, con capturas inspeccionadas. No se borraron datos del perfil personal del usuario. Se comprobó Splash con base vacía, archivos rechazados, onboarding disponible después del error, vista previa sin escrituras, cancelación y selección repetida, confirmación, fallo de almacenamiento y reintento, entrada automática, Dashboard, Movimientos, Deudas, Ahorros, recarga y comparación exacta de las 11 tablas. Se comprobó acceso desde Más, descarga JSON y restauración con hogar existente.

Anchuras: 320, 390, 768 y 1280 px. Splash, error y confirmación sin desbordamiento horizontal. Capturas de confirmación revisadas en claro y oscuro. Cero errores capturados de consola, excepciones sin manejar o recursos fallidos en la ejecución final de recuperación.

Referencia Figma Make consultada mediante MCP: App, SplashScreen y RespaldoScreen. Make no admite get_screenshot; se utilizó su código de referencia y la interfaz existente. La marca y el diseño original de Splash se conservaron.

Evidencia local ignorada por Git: tests/browser/artifacts/recovery/result.json y sus capturas PNG. La prueba se reproduce con node tests/browser/recovery.mjs. No se realizó interacción manual con el selector nativo del sistema: CDP abrió el flujo y proporcionó los archivos al input; tampoco se probaron dispositivos físicos o navegadores distintos de Chrome.

## Archivos

Modificados:

- src/app/services/financeSession.ts
- src/app/providers/FinanceProvider.tsx
- src/app/state/financeContext.ts
- src/features/onboarding/pages/SplashPage.tsx
- src/features/backup/pages/BackupPage.tsx
- src/styles/figma.css

Creados:

- src/features/backup/components/RestoreBackup.tsx
- tests/fixtures/recoveryBackup.ts
- tests/emptyInstallationRecovery.test.ts
- tests/browser/recovery.mjs
- docs/phase-4-1-validation.md

## Limitaciones conservadas

Solo se admite el esquema de respaldo v1 y se reemplazan datos, no se combinan. Se conserva el alcance de validación existente; esta fase no amplía sus comprobaciones de coherencia financiera. La copia no incluye el tema de localStorage. Un archivo válido sin hogar no sirve para recuperar un hogar desde Splash. No se añadieron cambios de recurrencia, historial, simulador, PWA, autenticación ni sincronización.
