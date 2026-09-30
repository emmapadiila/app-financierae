# Dominio financiero

`models/financial.ts` define los modelos y las validaciones Zod. Los contratos de
repositorios y transacciones están en `ports/financeRepositories.ts`.

Los servicios y calculadores de `src/features/*/services` implementan las
operaciones financieras sin importar React. Los calculadores no escriben datos.
Los servicios reciben repositorios por sus contratos; IndexedDB y Dexie se
implementan en `src/infrastructure/storage`.

`src/app/services/createFinanceApplication.ts` ensambla los servicios. La sesión
de aplicación en `financeSession.ts` ofrece operaciones y observación de datos a
la interfaz sin exponer conexiones de almacenamiento. Los componentes no deben
importar Dexie ni acceder directamente a IndexedDB.

Estas fronteras se comprueban en `tests/architecture.test.ts`.
