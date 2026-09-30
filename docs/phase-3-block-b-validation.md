# Fase 3 — Bloque B: movimientos y pagos

Base conservada: `38ab457799b22d16777c6860cec5d5f7d07032db`.
Validación: 30 de septiembre de 2026.

## Referencias y alcance

| Imágenes | Implementación |
| --- | --- |
| 10–11 | Un único formulario desplazable de nuevo gasto, cabecera roja |
| 12 | Movimientos agrupados por fecha, resumen mensual y cuatro filtros |
| 13 | Menú flotante con nuevo ingreso, nuevo gasto y registrar pago |
| 16 | Nuevo ingreso, cabecera verde |
| 17 | Registrar pago de una deuda existente, cabecera naranja |
| 14–15, 18–29 | Fuera de este bloque; no implementadas |

Se mantienen tarjetas blancas, fondo gris, espaciados, pestañas redondeadas,
botón principal verde y navegación inferior activa. No se dibuja el marco del
teléfono. Los SVG sustituyen los iconos de las referencias. Las categorías
de gasto son las del usuario; puede escribir una nueva. No se crean categorías
ni registros financieros copiando Figma.

## Implementación e integración

Se completan las páginas existentes `TransactionsPage` y `NewTransactionPage`.
No se introduce un segundo sistema de componentes: se reutilizan CurrencyInput,
FinanceIcon, Icon, Card, Field, Button, Segmented, EmptyState, ErrorNotice,
AppShell, MonthSelector y BottomNavigation.

Los tres tipos de operación pasan por `financeSession.recordMovement` y
`financeWorkspace.saveMovement`. Los servicios de ingresos, gastos y deudas,
repositorios y transacciones IndexedDB siguen siendo los existentes. El
movimiento y su entidad se guardan juntos; si falla el ledger, se revierte
también el pago y la modificación del saldo. React no accede a la base de datos.

La suscripción existente de financeSession entrega los datos actualizados
al contexto. Dashboard recalcula con los calculadores existentes, y Movimientos
usa movementHistory y filteredMovementHistory, sin duplicar registros enlazados.
Al guardar se vuelve al historial del mes seleccionado con confirmación visible.

El pago selecciona una deuda real y llama a DebtService. Se conserva la regla
de Fase 2 para un importe superior al saldo: se registra el importe completo
y el saldo queda en cero. La interfaz explica este comportamiento antes de
guardar; las deudas saldadas no se ofrecen para nuevos pagos.

El gasto se registra como pagado. Su fecha y vencimiento opcional se conservan
por separado; el cálculo existente asigna el gasto al mes del vencimiento.
La recurrencia usa el vencimiento de origen y respeta fin de mes sin duplicar
cargos. Los cargos posteriores son pendientes y se generan al abrir la app.

Hay estados de carga, vacío, validación, guardado, éxito y error. El formulario
se deshabilita durante el guardado y un bloqueo síncrono evita doble envío.
El FAB tiene transición, cierre por Escape y soporte de movimiento reducido.

## Evidencia de validación

- `npm test`: 85/85; 68 pruebas anteriores sin cambios y 17 nuevas.
- `npm run typecheck`: correcto.
- `npm run lint`: sin errores ni warnings.
- `npm run build`: correcto.
- `npm run test:ui`: 6 escenarios del Bloque A correctos. Solo se adapta el
  acceso pendiente comprobado: Deudas sigue pendiente y Movimientos ya existe.
- `npm run test:ui:b`: 7 escenarios correctos; no hay errores de ejecución.

Las nuevas pruebas automáticas cubren ingreso, gasto, filtros, vacío,
actualización reactiva, persistencia, pago, saldo, sobrepago, entradas inválidas,
rollback y recurrencia con fecha de vencimiento distinta a la del pago.

Chrome recorre los formularios con datos introducidos por la UI en un perfil
aislado. Verifica doble envío, validación, fallo de almacenamiento y reintento,
signos e importes, categorías propias, los cuatro filtros, saldo de deuda,
Dashboard, recarga y reinicio completo. Cada pantalla y el menú se revisan en
320, 390, 430, 768 y 1280 px sin desbordamiento horizontal. Las capturas y
resultados quedan en `tests/browser/artifacts/block-b/`, excluidos de Git.

No se añadieron dependencias ni se copiaron datos financieros de Figma a src/.
La auditoría y las pruebas de arquitectura confirman la separación del núcleo
respecto a React y la ausencia de acceso directo a Dexie/IndexedDB en TSX.

## Limitaciones deliberadas

No se implementan páginas de Deudas ni funcionalidades de los bloques siguientes.
Las deudas disponibles para pagar son las registradas previamente, por ejemplo
durante onboarding. Fuentes e iconos originales de Figma no están incluidos.
Las pruebas de navegador requieren Chrome/Chromium y Node 22+; la ruta del
navegador puede indicarse mediante MFF_BROWSER.
