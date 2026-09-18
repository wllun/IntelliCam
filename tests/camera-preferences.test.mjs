import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CAMERA_ASPECT_RATIOS,
  DEFAULT_CAMERA_PREFERENCES,
  normalizeCameraPreferences,
} from '../utils/camera-preferences.mjs';

const cameraScreenSource = await readFile(
  new URL('../app/index.tsx', import.meta.url),
  'utf8',
);
const preferenceServiceSource = await readFile(
  new URL('../services/camera-preferences.ts', import.meta.url),
  'utf8',
);

test('normalizes persisted camera preferences', () => {
  assert.deepEqual(normalizeCameraPreferences({
    gridLines: true,
    aspectRatio: '9:16',
    timerSeconds: 10,
    shutterSoundEnabled: true,
    hdrEnabled: true,
  }), {
    gridLines: true,
    aspectRatio: '9:16',
    timerSeconds: 10,
    shutterSoundEnabled: true,
    hdrEnabled: true,
  });
});

test('orders ratio choices as square, standard, portrait widescreen and Full', () => {
  assert.deepEqual(CAMERA_ASPECT_RATIOS, ['1:1', '4:3', '9:16', 'Full']);
  assert.equal(DEFAULT_CAMERA_PREFERENCES.aspectRatio, '4:3');
});

test('migrates legacy widescreen preferences without losing the selection', () => {
  assert.equal(normalizeCameraPreferences({ aspectRatio: '16:9' }).aspectRatio, '9:16');
});

test('falls back field-by-field when stored values are invalid', () => {
  assert.deepEqual(normalizeCameraPreferences({
    gridLines: 'yes',
    aspectRatio: '3:2',
    timerSeconds: 7,
    shutterSoundEnabled: null,
    hdrEnabled: 1,
  }), DEFAULT_CAMERA_PREFERENCES);
});

test('hydrates all requested controls before saving preference changes', () => {
  assert.match(preferenceServiceSource, /AsyncStorage\.getItem\(CAMERA_PREFERENCES_KEY\)/);
  assert.match(preferenceServiceSource, /AsyncStorage\.setItem\(/);
  assert.match(cameraScreenSource, /setGridLines\(preferences\.gridLines\)/);
  assert.match(cameraScreenSource, /setAspectRatio\(preferences\.aspectRatio\)/);
  assert.match(cameraScreenSource, /setTimerSeconds\(preferences\.timerSeconds\)/);
  assert.match(cameraScreenSource, /setShutterSoundEnabled\(preferences\.shutterSoundEnabled\)/);
  assert.match(cameraScreenSource, /setHdrEnabled\(preferences\.hdrEnabled\)/);
  assert.match(cameraScreenSource, /if \(!cameraPreferencesHydrated\) return;/);
});
