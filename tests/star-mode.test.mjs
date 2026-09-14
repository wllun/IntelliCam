import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cameraSource = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const planSource = await readFile(new URL('../services/star-capture.ts', import.meta.url), 'utf8');
const metadataSource = await readFile(new URL('../services/photo-metadata.ts', import.meta.url), 'utf8');
const moduleConfig = JSON.parse(await readFile(
  new URL('../modules/star-processor/expo-module.config.json', import.meta.url),
  'utf8',
));
const androidProcessor = await readFile(
  new URL(
    '../modules/star-processor/android/src/main/java/expo/modules/starprocessor/StarProcessorModule.kt',
    import.meta.url,
  ),
  'utf8',
);
const iosProcessor = await readFile(
  new URL('../modules/star-processor/ios/StarProcessorModule.swift', import.meta.url),
  'utf8',
);

test('Star mode applies real manual camera controls only where supported', () => {
  assert.match(planSource, /platform === 'ios'/);
  assert.match(planSource, /supportsManualExposure/);
  assert.match(cameraSource, /setExposureLocked\(/);
  assert.match(cameraSource, /setFocusLocked\(1\)/);
  assert.match(cameraSource, /setWhiteBalanceLocked\(gains\)/);
});

test('Star mode captures flash-off frames and stacks the automatic fallback', () => {
  assert.match(cameraSource, /isStarMode \? 'off'/);
  assert.match(cameraSource, /StarProcessor\.stackAverageAsync\(/);
  assert.match(cameraSource, /Capturing stars.*frameIndex \+ 1/);
  assert.deepEqual(moduleConfig.platforms, ['apple', 'android']);
  assert.match(androidProcessor, /averageInto\(mutableBase, frame/);
  assert.match(iosProcessor, /CIAdditionCompositing/);
  assert.match(iosProcessor, /CIColorMatrix/);
});

test('Star capture records the applied plan without claiming unsupported settings', () => {
  assert.match(cameraSource, /manualExposureApplied: appliedStarPlan \? manualExposureApplied/);
  assert.match(cameraSource, /captureFallbackReason: starFallbackReason/);
  assert.match(metadataSource, /row\('Capture strategy'/);
  assert.match(metadataSource, /row\('Frames combined'/);
  assert.match(metadataSource, /row\('Fallback'/);
});
