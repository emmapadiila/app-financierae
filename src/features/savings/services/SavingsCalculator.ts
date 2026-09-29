export interface SavingsProgressInput {
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
}

export interface SavingsProgress {
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  progressPercent: number;
  estimatedMonths: number | null;
}

export class SavingsCalculator {
  calculateProgress(input: SavingsProgressInput): SavingsProgress {
    if (
      !Number.isFinite(input.targetAmount) ||
      !Number.isFinite(input.currentAmount) ||
      !Number.isFinite(input.monthlyContribution) ||
      input.targetAmount < 0 ||
      input.currentAmount < 0 ||
      input.monthlyContribution < 0
    ) {
      throw new RangeError('Los valores de ahorro deben ser números finitos no negativos.');
    }

    const remainingAmount = Math.max(0, input.targetAmount - input.currentAmount);
    const progressPercent =
      input.targetAmount === 0
        ? 100
        : Math.min(100, (input.currentAmount / input.targetAmount) * 100);

    return {
      targetAmount: input.targetAmount,
      currentAmount: input.currentAmount,
      remainingAmount,
      progressPercent,
      estimatedMonths:
        remainingAmount === 0
          ? 0
          : input.monthlyContribution === 0
            ? null
            : Math.ceil(remainingAmount / input.monthlyContribution),
    };
  }
}