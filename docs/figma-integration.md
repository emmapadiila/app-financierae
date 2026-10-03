# Integración Figma Make

Fuente: https://www.figma.com/make/UGpNLOWqJXUdxiAOIKiVu0/FinTech-App-Design

## Auditoría inicial

React 19, TypeScript estricto, React Router 7, Vite 8, Tailwind 4 y CSS propio. Sin backend, API remota ni autenticación: familia local, Dexie/IndexedDB con 11 tablas y esquemas Zod. FinanceProvider recibe snapshots mediante liveQuery; las páginas no acceden a la base de datos. Servicios y calculadoras independientes de React. Vitest, fake-indexeddb y pruebas de navegador con Chrome/CDP. Repositorio limpio al iniciar.

## Inventario y mapeo previo a cambios

| Figma Make                                            | Ruta / vista                     | Estado inicial                     | Lógica / persistencia                                        |
| ----------------------------------------------------- | -------------------------------- | ---------------------------------- | ------------------------------------------------------------ |
| Splash                                                | /, SplashPage                    | A                                  | Familia local                                                |
| Onboarding: ingresos, gastos, deudas, ahorro, resumen | /onboarding, /onboarding/summary | A                                  | FinanceSession.initialize, servicios, presupuesto            |
| Dashboard                                             | /dashboard                       | B                                  | dashboardModel, BudgetCalculator, FinancialSummaryCalculator |
| Movimientos                                           | /transactions                    | A                                  | movementHistory, transacciones y entidades                   |
| Agregar movimiento: gasto, ingreso, pago              | /transactions/new                | A                                  | recordMovement, Income/Expense/DebtService                   |
| Deudas                                                | /debts                           | A                                  | DebtService, debtOverview                                    |
| Detalle de deuda                                      | /debts/:debtId                   | B: diálogo existente, página vacía | debtOverview, historial, DebtService                         |
| Plan deudas                                           | /debt-plan                       | B                                  | DebtPlanner, configuración de estrategia                     |
| Más                                                   | /more                            | C                                  | Navegación                                                   |
| Simulador                                             | /simulator                       | C                                  | DebtSimulator                                                |
| Presupuesto                                           | /budget                          | C                                  | BudgetCalculator, MonthlyBudget                              |
| Ahorros                                               | /savings                         | C                                  | SavingsService, SavingsCalculator                            |
| Calendario                                            | /calendar                        | C                                  | Gastos, ingresos, pagos y vencimientos                       |
| Reportes                                              | /reports                         | C                                  | Calculadoras existentes                                      |
| Configuración                                         | /settings                        | C                                  | FamilyService, FinancialSettingsService                      |
| Respaldo                                              | /backup                          | C                                  | exportBackup, importBackup, validación v1                    |

A: implementado; B: parcial; C: solo diseño; D (conservar): ingreso cero explícito, gastos personalizados, recurrencia, frecuencia de ingresos, tasas anuales, reserva vs aporte real, estrategias persistidas, orden personalizado, paginación de proyección y errores de no convergencia.

## Referencia visual

16 archivos Screen de Figma Make; 17 vistas al contar el resumen del onboarding por separado; onboarding con cinco pasos; temas claro/oscuro; cuatro filtros de movimientos, menú flotante y tres variantes del formulario; tres estrategias de deuda. Make devuelve código fuente por recursos MCP, no frames Design. get_metadata y get_screenshot no admiten Make; comparación basada en código y capturas locales, no píxel a píxel. Ninguna pantalla usa las dos imágenes PNG listadas como recursos del proyecto. Iconografía: emojis y SVG integrados. No hay pantallas de login ni estados completos de error/loading en el prototipo; se conservan/amplían los estados reales.

Manrope, verde #16a34a / #22c55e, navy #162248 / #0f1830 / #090e1e; fondo #f8fafc, tarjetas blancas, bordes slate, radios 12/16/24 px, padding móvil 16–24 px, títulos 20–24 px, importes 18–36 px. El marco telefónico y la hora ficticia son presentación del prototipo, no interfaz del producto. Adaptación ancha con columnas y navegación lateral.

## Diferencias funcionales

Los límites guardados son por grupos (fijos, variables, deudas, ahorro), no por categoría. Se presenta el desglose real por categoría sin inventar límites. Las tasas del modelo son anuales, no las tasas mensuales del ejemplo. El simulador usa DebtSimulator, nunca la fórmula demostrativa de Make. Los escenarios se revisan como presupuesto planificado, no se registran como ingresos/pagos reales. No hay servicio de notificaciones ni tienda para calificar; no se presentan botones inoperantes. Datos financieros exclusivamente del almacenamiento real.
