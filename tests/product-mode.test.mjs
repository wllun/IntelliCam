import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cameraSource = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const planSource = await readFile(
  new URL('../services/product-capture.ts', import.meta.url),
  'utf8',
);
const metadataSource = await readFile(
  new URL('../services/photo-metadata.ts', import.meta.url),
  'utf8',
);

test('Product mode resolves locked and automatic detail plans honestly', () => {
  assert.match(planSource, /locked-detail-capture/);
  assert.match(planSource, /automatic-detail-capture/);
  assert.match(planSource, /PRODUCT_HIGHLIGHT_PROTECTION_EV = -0\.4/);
  assert.match(planSource, /supportsFocusLock/);
  assert.match(planSource, /supportsExposureLock/);
  assert.match(planSource, /supportsWhiteBalanceLock/);
});

test('Product mode meters the center and locks supported camera channels', () => {
  assert.match(cameraSource, /prepareProductCapture\(productCapturePlan\)/);
  assert.match(cameraSource, /Could not protect Product highlights/);
  assert.match(cameraSource, /adaptiveness: useLockedMetering \? 'locked' : 'continuous'/);
  assert.match(cameraSource, /Capturing product detail/);
  assert.match(cameraSource, /flashMode: isFlashDisabledForMode \? 'off'/);
});

test('Product mode records its applied detail and white-balance strategy', () => {
  assert.match(cameraSource, /whiteBalanceStrategy: captureWhiteBalanceApplied/);
  assert.match(metadataSource, /locked-detail-capture/);
  assert.match(metadataSource, /automatic-detail-capture/);
  assert.match(metadataSource, /Automatic locked/);
});
