import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createExposureSteps,
  findNearestExposureStepIndex,
  formatExposureValue,
} from '../utils/exposure-control.mjs';

const cameraScreenSource = await readFile(
  new URL('../app/index.tsx', import.meta.url),
  'utf8',
);

test('maps every Android exposure index to one distinct displayed detent', () => {
  const steps = createExposureSteps({
    platform: 'android',
    supported: true,
    deviceMinimum: -12,
    deviceMaximum: 6,
  });

  assert.equal(steps.length, 19);
  assert.deepEqual(steps[0], { displayValue: -2, nativeValue: -12 });
  assert.deepEqual(steps.at(-1), { displayValue: 2, nativeValue: 6 });
  assert.deepEqual(steps[12], { displayValue: 0, nativeValue: 0 });
  assert.deepEqual(steps[15], { displayValue: 1, nativeValue: 3 });
  assert.equal(new Set(steps.map((step) => step.nativeValue)).size, steps.length);
});

test('uses the supported iOS EV range with precise display values', () => {
  const steps = createExposureSteps({
    platform: 'ios',
    supported: true,
    deviceMinimum: -1.25,
    deviceMaximum: 1.35,
  });

  assert.deepEqual(steps[0], { displayValue: -1.25, nativeValue: -1.25 });
  assert.deepEqual(steps.at(-1), { displayValue: 1.35, nativeValue: 1.35 });
  assert.equal(steps[findNearestExposureStepIndex(steps, 0)].nativeValue, 0);
  assert.equal(formatExposureValue(-1.25), '-1.25');
  assert.equal(formatExposureValue(0), '0');
});

test('throttles exposure display and native camera updates', () => {
  assert.match(cameraScreenSource, /EXPOSURE_DISPLAY_UPDATE_INTERVAL_MS = 32/);
  assert.match(cameraScreenSource, /EXPOSURE_NATIVE_UPDATE_INTERVAL_MS = 48/);
  assert.match(cameraScreenSource, /queuedNativeExposureRef\.current = exposure/);
  assert.match(cameraScreenSource, /controller\.setExposureBias\(exposure\)/);
  assert.match(cameraScreenSource, /useAnimatedReaction\([\s\S]*exposureGestureActive\.get\(\)/);
  assert.doesNotMatch(cameraScreenSource, /runOnJS\(updateExposureFromDrag\)/);
});
