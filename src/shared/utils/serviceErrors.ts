export class EntityNotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} no encontrado: ${id}`);
    this.name = 'EntityNotFoundError';
  }
}

export class InsufficientBalanceError extends Error {
  constructor(message = 'El saldo disponible es insuficiente.') {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}

export class ConfirmationRequiredError extends Error {
  constructor() {
    super('Se requiere confirmación explícita para reemplazar los datos existentes.');
    this.name = 'ConfirmationRequiredError';
  }
}

export class PlanningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanningError';
  }
}