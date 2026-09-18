import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cameraSource = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const planSource = await readFile(
  new URL('../services/light-trail-capture.ts', import.meta.url),
  'utf8',
);
const metadataSource = await readFile(
  new URL('../services/photo-metadata.ts', import.meta.url),
  'utf8',
);
const androidProcessor = await readFile(
  new URL(
    '../modules/star-processor/android/src/main/java/expo/modules/starprocessor/StarProcessorModule.kt',
    import.meta.url,
  ),
  'utf8',
);
const iosProcessor = await readFile(
  new URL('../modules/star-processor/ios/StarProcessorModule.swift', import.meta.url),
  'utf8',
);

test('Light Trail resolves a real manual or multi-frame capture plan', () => {
  assert.match(planSource, /platform === 'ios'/);
  assert.match(planSource, /IDEAL_EXPOSURE_SECONDS = 4/);
  assert.match(planSource, /LIGHT_TRAIL_FRAME_COUNT = 8/);
  assert.match(planSource, /automatic-lighten-composite/);
  assert.match(cameraSource, /prepareLightTrailCapture\(lightTrailCapturePlan\)/);
  assert.match(cameraSource, /setExposureLocked\(/);
});

test('Light Trail captures timed flash-off frames and composites their highlights', () => {
  assert.match(cameraSource, /plan\.resolved\.flashMode = isFlashDisabledForMode \? 'off'/);
  assert.match(cameraSource, /LIGHT_TRAIL_FRAME_INTERVAL_MS/);
  assert.match(cameraSource, /MultiFrameProcessor\.processAsync\(/);
  assert.match(cameraSource, /multiFrameMode === 'light-trail'/);
  assert.match(androidProcessor, /private fun lightenInto/);
  assert.match(iosProcessor, /CIMaximumCompositing/);
});

test('Light Trail records applied settings and an honest fallback', () => {
  assert.match(cameraSource, /captureStrategy: appliedCapturePlan\?\.strategy/);
  assert.match(cameraSource, /lighten blend trail composite/);
  assert.match(metadataSource, /automatic-lighten-composite/);
  assert.match(metadataSource, /Automatic light trail composite/);
});
