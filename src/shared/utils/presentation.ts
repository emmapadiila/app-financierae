import { ZodError } from 'zod';

export function formatMoney(amount: number, currency = 'COP', locale = 'es-CO') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}
export function formatMonth(month: string) {
  const result = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`));
  return result.charAt(0).toUpperCase() + result.slice(1);
}
export function formatDate(date: string) {
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}
export function errorMessage(error: unknown) {
  if (error instanceof ZodError) return 'Revisa los campos: usa nombres válidos, fechas completas e importes mayores que cero.';
  return error instanceof Error ? error.message : 'No se pudo guardar. Inténtalo de nuevo.';
}
