// Labels and icons are UI vocabulary, not financial records or sample amounts.
export const categories = [
  { name: 'Alimentación', icon: '🛒' }, { name: 'Servicios', icon: '🌐' },
  { name: 'Transporte', icon: '🚗' }, { name: 'Vivienda', icon: '🏠' },
  { name: 'Educación', icon: '🎓' }, { name: 'Salud', icon: '💊' },
  { name: 'Entretenimiento', icon: '🎭' }, { name: 'Ropa', icon: '🛍️' },
  { name: 'Ingreso', icon: '💰' }, { name: 'Deuda', icon: '💳' },
];
export const householdExpenses = [
  { name: 'Energía', category: 'Servicios', icon: '⚡' },
  { name: 'Agua', category: 'Servicios', icon: '💧' },
  { name: 'Gas', category: 'Servicios', icon: '🔥' },
  { name: 'Internet', category: 'Servicios', icon: '🌐' },
  { name: 'Alimentación', category: 'Alimentación', icon: '🛒' },
  { name: 'Arriendo', category: 'Vivienda', icon: '🏠' },
  { name: 'Transporte', category: 'Transporte', icon: '🚗' },
  { name: 'Educación', category: 'Educación', icon: '🎓' },
];
export const categoryIcon = (name: string) => householdExpenses.find(item => item.name === name)?.icon ?? categories.find(item => item.name === name)?.icon ?? '🧾';
