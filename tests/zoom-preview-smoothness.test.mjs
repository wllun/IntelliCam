import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cameraSource = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');

test('keeps live preview zoom fine-grained without binding a shared value to Camera', () => {
  assert.match(cameraSource, /const ZOOM_NATIVE_UPDATE_STEPS = 128;/);
  assert.match(cameraSource, /const ZOOM_NATIVE_UPDATE_INTERVAL_MS = 24;/);
  assert.match(cameraSource, /const range = nativeGestureMaxZoom - nativeGestureMinZoom;/);
  assert.match(cameraSource, /zoom=\{cameraZoomProp\}/);
  assert.doesNotMatch(cameraSource, /zoom=\{cameraZoom\}/);
});

test('uses a real duration for Android numbered-zoom transitions', () => {
  assert.match(
    cameraSource,
    /Platform\.OS === 'android' \? ZOOM_TRANSITION_MS : 4/,
  );
  assert.match(cameraSource, /startZoomAnimation\(option\.targetZoom, nativeZoomRate\)/);
});
