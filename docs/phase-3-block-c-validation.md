# Fase 3 — Bloque C: Deudas y Plan

Base: `669ccb31b6a2f7dceb63030deec15bce601e8e32`.
Validación: 30 de septiembre de 2026.

## Interpretación visual

- 14 y 23 muestran la misma zona superior de Deudas; 15 continúa verticalmente
  sus tarjetas y la acción Agregar deuda. Se implementa una sola página.
- 18 y 25 muestran la cabecera, meta y estrategias del Plan; 19 y 26 continúan
  con las estrategias y el timeline; 27 muestra su tramo final. Se implementa
  una sola página con selección de estrategia y timeline desplazable.
- No se reproduce el marco del teléfono ni se copian registros financieros.
  Colores, gradientes, tarjetas, badges, progreso y jerarquía siguen las referencias.

## Pantallas y componentes

Se completan DebtsPage y DebtPlanPage y se conectan AppRouter, BottomNavigation
y los accesos existentes del Dashboard. El detalle de deuda es un diálogo
breve con acreedor, importes, tasa anual e historial real de pagos.

Nuevo componente: DebtTimeline. Nuevo adaptador de aplicación: debtViews,
con debtOverview, debtPlanView y normalizeDebtOrder. Se reutilizan DebtEditor,
FormDialog, CurrencyInput, PageHeader, AppShell, Card, Button, EmptyState,
ErrorNotice, Icon y ProgressBar. DebtEditor admite guardado asíncrono y evita
doble envío, manteniendo su uso en onboarding.

## Servicios y persistencia

- Agregar deuda llama al DebtService existente a través de la fachada app.services.
- Registrar pago abre el formulario del Bloque B con deuda preseleccionada y
  vuelve a Deudas. Se conserva su transacción y la regla de saldo no negativo.
- La suscripción de financeSession actualiza listado, resumen y proyección.
- FinancialSummaryCalculator calcula total y progreso general/individual.
- DebtPlanner calcula todas las proyecciones. Snowball conserva su prioridad
  por menor saldo; avalanche por mayor tasa; custom recibe el orden establecido
  con botones accesibles de subir/bajar. No se duplican algoritmos en React.
- La única ampliación del resultado del planner es priorityOrder: expone el
  orden que ya calculaba internamente, sin alterar fórmulas ni asignaciones.
- La configuración existente admite debtPlan opcional (strategy y customOrder).
  FinancialSettingsService la guarda en IndexedDB. Los registros anteriores
  siguen siendo válidos; no se añade una base de datos ni una tabla paralela.
- El orden se normaliza al liquidar o incorporar una deuda, sin repetir IDs.

## Proyección y timeline

El plan inicia el mes siguiente al actual y usa saldos y cuotas mínimas vigentes,
sin suponer un aporte extra. La interfaz lo explica: es una proyección de pago,
no una garantía de que el presupuesto cubra las cuotas. No se copian fechas,
duraciones ni tasas mensuales de las referencias; el modelo guarda tasas anuales
y así se muestran.

Cada fila proviene de monthlyProjection: mes, deuda prioritaria, pago de esa
deuda, total de pagos del mes, saldo proyectado, liquidaciones y detalle de
intereses/pagos por deuda. La fecha final y el número de meses vienen del
planner. El timeline muestra 12 meses por tanda mediante Mostrar más meses,
sin truncar la proyección. Los límites y errores de convergencia son los del
planner existente; no se inventa una fecha cuando este no puede calcularla.

Las deudas liquidadas siguen visibles, con 100% de progreso cuando corresponde,
pero no cuentan como activas ni permiten pagos nuevos. Hay estados para ausencia
de deudas y para proyecciones inviables.

## Validación

| Comprobación | Resultado |
| --- | --- |
| npm test | 100/100: 85 anteriores intactas + 15 nuevas |
| npm run typecheck | Correcto |
| npm run lint | Sin errores ni warnings |
| npm run build | Correcto |
| npm run test:ui | 6 escenarios de regresión del Bloque A |
| npm run test:ui:b | 7 escenarios de regresión del Bloque B |
| npm run test:ui:c | 6 escenarios del Bloque C; sin errores de ejecución |

Pruebas nuevas: listado vacío, totales y progreso, deuda liquidada, vencimiento
en fin de mes, una deuda a interés cero, múltiples deudas y tres estrategias,
cambio de prioridad sin escribir pagos simulados, normalización del orden,
actualización tras pagar, persistencia, intereses altos, cuota nula o insuficiente,
no convergencia y timeline de 500 meses.

Chrome crea las deudas por UI y comprueba total, deuda preseleccionada al pagar,
saldo actualizado, historial del detalle, tres estrategias, reordenación,
recarga y reinicio completo, deuda liquidada y proyección imposible. Comprueba
320, 390, 430, 768 y 1280 px, incluidos nombres largos, importes grandes y un
timeline extenso con expansión a 24 meses. Los datos de prueba viven en perfiles
aislados; capturas y resultados se guardan en tests/browser/artifacts/block-c,
excluidos de Git. Node 22+ y Chrome/Chromium son necesarios para este recorrido.

La auditoría de src/ no encontró importes, nombres, fechas ni duraciones de Figma
usados como datos de producción. Los componentes no acceden directamente a
Dexie/IndexedDB y las pruebas de arquitectura continúan pasando.

## Límites

No se implementan Simulador, Presupuesto, Calendario, Reportes ni Respaldo.
No hay edición/eliminación de deudas en esta entrega; se puede agregar deuda,
consultar su detalle y registrar pagos. El plan utiliza cuotas mínimas, sin
configurar aportes adicionales. Los SVG y fuentes disponibles reproducen el
lenguaje visual; no se incluyen activos originales de Figma. No se añadieron
dependencias.
