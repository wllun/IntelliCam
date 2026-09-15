import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cameraScreenSource = await readFile(
  new URL('../app/index.tsx', import.meta.url),
  'utf8',
);

test('always captures at maximum native photo quality without a settings choice', () => {
  assert.match(cameraScreenSource, /targetResolution: CommonResolutions\.HIGHEST_4_3/);
  assert.match(cameraScreenSource, /quality: 1/);
  assert.match(cameraScreenSource, /qualityPrioritization: ['"]quality['"]/);
  assert.match(cameraScreenSource, /photoQuality: ['"]maximum['"]/);
  assert.doesNotMatch(cameraScreenSource, /PHOTO_QUALITY_OPTIONS|setPhotoQuality|UHD_4_3/);
  assert.doesNotMatch(cameraScreenSource, /<Text style=\{styles\.settingLabel\}>Photo quality<\/Text>/);
});

test('uses available native enhancement controls for maximum quality', () => {
  assert.match(cameraScreenSource, /enableLowLightBoost:/);
  assert.match(cameraScreenSource, /supportsLowLightBoost/);
  assert.match(cameraScreenSource, /enableDistortionCorrection:/);
  assert.match(cameraScreenSource, /enableVirtualDeviceFusion:/);
  assert.match(cameraScreenSource, /captureSession,\s*100,\s*metadata/);
});
