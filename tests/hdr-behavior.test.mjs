import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cameraScreenSource = await readFile(
  new URL('../app/index.tsx', import.meta.url),
  'utf8',
);

test('disables HDR when the selected camera does not support native photo HDR', () => {
  assert.match(cameraScreenSource, /disabled=\{!supportsNativeHdr\}/);
  assert.match(cameraScreenSource, /disabled: !supportsNativeHdr/);
  assert.match(cameraScreenSource, />\s*Unavailable\s*</);
  assert.match(
    cameraScreenSource,
    /if \(!supportsNativeHdr\) \{\s*setHdrEnabled\(false\);\s*\}/,
  );
});

test('records HDR only after the supported camera session confirms it', () => {
  assert.match(
    cameraScreenSource,
    /setHdrSessionConfirmed\(\s*nativeHdrRequested && config\.isPhotoHDREnabled/,
  );
  assert.match(
    cameraScreenSource,
    /hdr: nativeHdrRequested && hdrSessionConfirmed/,
  );
  assert.doesNotMatch(
    cameraScreenSource,
    /supportsNativeHdr \? config\.isPhotoHDREnabled : true/,
  );
});
