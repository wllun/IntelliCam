import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cameraSource = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const planSource = await readFile(
  new URL('../services/waterfall-capture.ts', import.meta.url),
  'utf8',
);
const metadataSource = await readFile(
  new URL('../services/photo-metadata.ts', import.meta.url),
  'utf8',
);

test('Waterfall resolves a real slow-exposure or temporal-average plan', () => {
  assert.match(planSource, /platform === 'ios'/);
  assert.match(planSource, /IDEAL_EXPOSURE_SECONDS = 1/);
  assert.match(planSource, /MINIMUM_USEFUL_EXPOSURE_SECONDS = 0\.25/);
  assert.match(planSource, /WATERFALL_FRAME_COUNT = 8/);
  assert.match(planSource, /automatic-temporal-average/);
  assert.match(cameraSource, /prepareWaterfallCapture\(waterfallCapturePlan\)/);
});

test('Waterfall locks metering, protects highlights, and averages timed frames', () => {
  assert.match(cameraSource, /Could not protect Waterfall highlights/);
  assert.match(cameraSource, /WATERFALL_FRAME_INTERVAL_MS/);
  assert.match(cameraSource, /Smoothing waterfall/);
  assert.match(cameraSource, /MultiFrameProcessor\.processAsync\(/);
  assert.match(cameraSource, /temporal average water smoothing/);
});

test('Waterfall records the applied strategy and fallback', () => {
  assert.match(metadataSource, /manual-slow-exposure/);
  assert.match(metadataSource, /automatic-temporal-average/);
  assert.match(metadataSource, /Automatic temporal average/);
  assert.match(cameraSource, /Frame alignment failed\. The reference photo was saved/);
  assert.match(cameraSource, /captureStrategy: multiFrameMode && !multiFrameResult\?\.applied/);
});
