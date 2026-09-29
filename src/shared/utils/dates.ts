export function currentTimestamp(): string {
  return new Date().toISOString();
}

export function currentMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(month: string): { start: string; end: string } {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthNumber = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new RangeError(`Mes inválido: ${month}`);
  }

  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function addMonthsToMonth(month: string, amount: number): string {
  const [yearText, monthText] = month.split('-');
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function dateForMonth(month: string): string {
  return `${month}-01`;
}