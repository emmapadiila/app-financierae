# Fase 3 — cierre del Bloque A

Validación final: 30 de septiembre de 2026.

La implementación está conservada en `3f9f0f0`. Este cierre registra su
validación sin reescribir ese commit ni desarrollar el siguiente bloque.

## Alcance implementado

| Referencia | Pantalla |
| --- | --- |
| 1 | Splash |
| 2 | Onboarding: ingreso mensual |
| 3 | Onboarding: gastos |
| 4 | Onboarding: deudas |
| 5 | Onboarding: reserva y ahorro |
| 6 | Resumen inicial persistido |
| 7–9 | Dashboard: resumen, indicadores, próximos pagos, gráficos y accesos |

Componentes comunes: CurrencyInput, FinanceIcon, Icon, FormDialog,
ProgressBar, StepProgress, PageHeader y BottomNavigation. Los formularios
ExpenseEditor y DebtEditor pertenecen al onboarding. SummaryCard y
ExpenseChart presentan importes y distribuciones obtenidos del núcleo.

## Datos y arquitectura

- Los formularios pasan por financeSession y la coordinación de
  financeWorkspace, los servicios existentes y los repositorios de IndexedDB.
- useDashboard y dashboardModel conectan los registros con los calculadores.
- No hay importes, fechas, porcentajes ni registros financieros de las
  capturas usados como datos de producción. Las etiquetas de categorías,
  colores y constantes de presentación son vocabulario de interfaz.
- Los gráficos y próximos pagos utilizan registros y cálculos reales.
- Una meta de ahorro no se trata como dinero ahorrado: solo se crea un aporte
  cuando el usuario confirma que ya apartó el importe.
- Los componentes TSX no acceden directamente a Dexie/IndexedDB. Las pruebas
  de arquitectura mantienen la independencia del núcleo respecto de React.
- Los datos de prueba del navegador viven en perfiles aislados; las capturas
  y resultados generados están excluidos de Git.

## Validación ejecutada

| Comando | Resultado |
| --- | --- |
| npm test | 68/68: 51 originales conservadas y 17 nuevas |
| npm run typecheck | Correcto |
| npm run lint | Sin errores ni warnings |
| npm run build | Producción compilada correctamente |
| npm run test:ui | 6 escenarios de Chrome correctos; sin errores de ejecución |

Chrome verificó entrada mediante formularios, resumen y Dashboard con datos
reales, actualización tras modificar un gasto mediante el servicio, recarga
y reinicio completo conservando los registros y omitiendo el onboarding,
estados vacíos sin datos ficticios, persistencia del tema y ausencia de
desbordamiento horizontal en 320, 390, 430, 768 y 1280 píxeles.

El script de navegador requiere Node 22+ y Chrome/Chromium (ruta configurable
con MFF_BROWSER). No se añadieron dependencias en este bloque.

## Límites de esta entrega

Los accesos a funcionalidades posteriores muestran un aviso de próxima
entrega. No se implementaron las pantallas siguientes de movimientos, deudas,
plan, simulador, presupuesto, calendario, reportes ni respaldo. Los iconos se
reconstruyeron con SVG y la tipografía utiliza la pila disponible del sistema;
no se incorporaron archivos originales de fuentes o iconos de Figma.
