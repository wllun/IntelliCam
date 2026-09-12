import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const captureModesSource = await readFile(
  new URL('../constants/capture-modes.ts', import.meta.url),
  'utf8',
);
const cameraScreenSource = await readFile(
  new URL('../app/index.tsx', import.meta.url),
  'utf8',
);

test('keeps Auto as the first and default capture mode', () => {
  assert.match(captureModesSource, /id:\s*['"]auto['"]/);
  assert.match(captureModesSource, /name:\s*['"]Auto['"]/);
  assert.match(
    captureModesSource,
    /CAPTURE_MODES[^=]*=\s*\[\s*AUTO_CAPTURE_MODE,/,
  );
  assert.match(
    cameraScreenSource,
    /useState\(DEFAULT_CAPTURE_MODE_ID\)/,
  );
});

test('uses one active mode id on the shared camera screen', () => {
  assert.match(cameraScreenSource, /selectedId=\{activeCaptureModeId\}/);
  assert.doesNotMatch(cameraScreenSource, /type CaptureMode = ['"]normal['"] \| ['"]preset['"]/);
});
