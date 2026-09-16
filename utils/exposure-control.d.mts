export interface ExposureStep {
  displayValue: number;
  nativeValue: number;
}

export function createExposureSteps(options: {
  platform: string;
  supported: boolean;
  deviceMinimum: number;
  deviceMaximum: number;
  displayLimit?: number;
}): ExposureStep[];

export function findNearestExposureStepIndex(
  steps: readonly ExposureStep[],
  displayValue: number,
): number;

export function formatExposureValue(value: number): string;
