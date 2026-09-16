const DEFAULT_DISPLAY_LIMIT = 2;
const IOS_DISPLAY_STEP = 0.1;

function roundExposure(value) {
  return Number(value.toFixed(4));
}

function createIosExposureSteps(deviceMinimum, deviceMaximum, displayLimit) {
  const minimum = Math.max(-displayLimit, deviceMinimum);
  const maximum = Math.min(displayLimit, deviceMaximum);
  if (minimum > maximum) return [{ displayValue: 0, nativeValue: 0 }];

  const values = [minimum];
  const firstIndex = Math.ceil((minimum - 0.0001) / IOS_DISPLAY_STEP);
  const lastIndex = Math.floor((maximum + 0.0001) / IOS_DISPLAY_STEP);
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    values.push(index * IOS_DISPLAY_STEP);
  }
  values.push(maximum);

  return [...new Set(values.map(roundExposure))]
    .sort((left, right) => left - right)
    .map((value) => ({ displayValue: value, nativeValue: value }));
}

function createAndroidExposureSteps(deviceMinimum, deviceMaximum, displayLimit) {
  const minimumIndex = Math.ceil(deviceMinimum);
  const maximumIndex = Math.floor(deviceMaximum);
  if (minimumIndex > maximumIndex) return [{ displayValue: 0, nativeValue: 0 }];

  return Array.from(
    { length: maximumIndex - minimumIndex + 1 },
    (_, offset) => {
      const nativeValue = minimumIndex + offset;
      let displayValue = 0;
      if (nativeValue < 0 && minimumIndex < 0) {
        displayValue = (nativeValue / minimumIndex) * -displayLimit;
      } else if (nativeValue > 0 && maximumIndex > 0) {
        displayValue = (nativeValue / maximumIndex) * displayLimit;
      }
      return { displayValue: roundExposure(displayValue), nativeValue };
    },
  );
}

export function createExposureSteps({
  platform,
  supported,
  deviceMinimum,
  deviceMaximum,
  displayLimit = DEFAULT_DISPLAY_LIMIT,
}) {
  if (
    !supported
    || !Number.isFinite(deviceMinimum)
    || !Number.isFinite(deviceMaximum)
    || deviceMinimum > deviceMaximum
  ) {
    return [{ displayValue: 0, nativeValue: 0 }];
  }

  return platform === 'android'
    ? createAndroidExposureSteps(deviceMinimum, deviceMaximum, displayLimit)
    : createIosExposureSteps(deviceMinimum, deviceMaximum, displayLimit);
}

export function findNearestExposureStepIndex(steps, displayValue) {
  if (steps.length === 0) return 0;

  let nearestIndex = 0;
  let nearestDistance = Math.abs(steps[0].displayValue - displayValue);
  for (let index = 1; index < steps.length; index += 1) {
    const distance = Math.abs(steps[index].displayValue - displayValue);
    if (distance < nearestDistance) {
      nearestIndex = index;
      nearestDistance = distance;
    }
  }
  return nearestIndex;
}

export function formatExposureValue(value) {
  const rounded = roundExposure(value);
  if (Math.abs(rounded) < 0.0001) return '0';
  if (Math.abs(rounded - Math.round(rounded)) < 0.0001) return rounded.toFixed(0);
  if (Math.abs(rounded * 10 - Math.round(rounded * 10)) < 0.0001) {
    return rounded.toFixed(1);
  }
  return rounded.toFixed(2);
}
