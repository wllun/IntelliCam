import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cameraScreenSource = await readFile(
  new URL('../app/index.tsx', import.meta.url),
  'utf8',
);
const preparationSource = await readFile(new URL('../hooks/use-capture-preparation.ts', import.meta.url), 'utf8');

test('disables HDR when the selected camera does not support native photo HDR', () => {
  assert.match(cameraScreenSource, /disabled=\{!supportsNativeHdr\}/);
  assert.match(cameraScreenSource, /disabled: !supportsNativeHdr/);
  assert.match(cameraScreenSource, />\s*Unavailable\s*</);
  assert.match(
    preparationSource,
    /const nativeHdrRequested = hdrEnabled && supportsNativeHdr/,
  );
  assert.doesNotMatch(
    cameraScreenSource,
    /if \(!supportsNativeHdr\) \{\s*setHdrEnabled\(false\);\s*\}/,
  );
});

test('records HDR only after the supported camera session confirms it', async () => {
  assert.match(
    cameraScreenSource,
    /setHdrSessionConfirmed\(\s*nativeHdrRequested && config\.isPhotoHDREnabled/,
  );
  assert.match(
    cameraScreenSource,
    /hdrConfirmed: nativeHdrRequested && hdrSessionConfirmed/,
  );
  const metadataSource = await readFile(new URL('../services/capture-metadata.ts', import.meta.url), 'utf8');
  assert.match(metadataSource, /hdr: settings\.hdr && context\.hdrConfirmed/);
  assert.doesNotMatch(
    cameraScreenSource,
    /supportsNativeHdr \? config\.isPhotoHDREnabled : true/,
  );
});
