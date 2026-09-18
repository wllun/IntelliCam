import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cameraScreenSource = await readFile(
  new URL('../app/index.tsx', import.meta.url),
  'utf8',
);
const preparationSource = await readFile(new URL('../services/capture-preparation.ts', import.meta.url), 'utf8');
const preparationHook = await readFile(new URL('../hooks/use-capture-preparation.ts', import.meta.url), 'utf8');
const planSource = await readFile(new URL('../utils/adaptive-capture.mjs', import.meta.url), 'utf8');

test('always captures maximum quality through shared native preparation', () => {
  assert.match(cameraScreenSource, /useCapturePreparation\(/);
  assert.match(cameraScreenSource, /cameraReady, 'maximum'/);
  assert.match(preparationSource, /CommonResolutions\.HIGHEST_4_3/);
  assert.match(preparationSource, /qualityPrioritization:/);
  assert.doesNotMatch(cameraScreenSource, /PHOTO_QUALITY_OPTIONS|setPhotoQuality/);
});

test('uses available native enhancement controls for maximum quality', () => {
  assert.match(preparationHook, /enableLowLightBoost:/);
  assert.match(preparationSource, /supportsLowLightBoost/);
  assert.match(preparationSource, /enableDistortionCorrection:/);
  assert.match(preparationSource, /enableVirtualDeviceFusion:/);
  assert.match(planSource, /photoQuality === 'maximum' \? 100 : 92/);
  assert.match(cameraScreenSource, /plan\.resolved\.jpegQuality/);
});
