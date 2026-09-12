import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cameraScreenSource = await readFile(
  new URL('../app/index.tsx', import.meta.url),
  'utf8',
);

test('starts with maximum native photo quality', () => {
  assert.match(
    cameraScreenSource,
    /useState<PhotoQuality>\(['"]maximum['"]\)/,
  );
  assert.match(cameraScreenSource, /CommonResolutions\.HIGHEST_4_3/);
  assert.match(
    cameraScreenSource,
    /qualityPrioritization:[^\n]*\? ['"]quality['"] : ['"]balanced['"]/,
  );
});

test('uses available native enhancement controls for maximum quality', () => {
  assert.match(cameraScreenSource, /enableLowLightBoost:/);
  assert.match(cameraScreenSource, /supportsLowLightBoost/);
  assert.match(cameraScreenSource, /enableDistortionCorrection:/);
  assert.match(cameraScreenSource, /enableVirtualDeviceFusion:/);
  assert.match(cameraScreenSource, /maximumPhotoQuality \? 100 : 92/);
});
