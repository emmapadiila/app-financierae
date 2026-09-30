// Canonical values remain unformatted decimal strings until service submission.
export function parseCurrencyInput(input: string): string | null {
  const stripped = input.replace(/[$\s.]/g, '').replace(',', '.');
  if (!/^\d*(?:\.\d{0,2})?$/.test(stripped)) return null;
  if (stripped === '') return '';
  if (!Number.isFinite(Number(stripped)) || Number(stripped) > Number.MAX_SAFE_INTEGER) return null;
  return stripped;
}
export function displayCurrencyInput(value: string) {
  if (!value) return '';
  const [integer = '', fraction] = value.split('.');
  const formatted = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(integer));
  return fraction !== undefined ? `${formatted},${fraction}` : formatted;
}
