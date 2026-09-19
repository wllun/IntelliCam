import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  getMultiFrameCapturePlan,
  isMultiFrameCaptureMode,
} from '../utils/multi-frame-capture.mjs';

const cameraScreenSource = await readFile(
  new URL('../app/index.tsx', import.meta.url),
  'utf8',
);
const androidProcessorSource = await readFile(
  new URL(
    '../modules/multi-frame-processor/android/src/main/java/expo/modules/multiframeprocessor/MultiFrameProcessorModule.kt',
    import.meta.url,
  ),
  'utf8',
);
const iosProcessorSource = await readFile(
  new URL('../modules/multi-frame-processor/ios/MultiFrameProcessorModule.swift', import.meta.url),
  'utf8',
);

test('assigns bounded burst plans only to computational capture modes', () => {
  assert.deepEqual(getMultiFrameCapturePlan('star'), { mode: 'star', frameCount: 6 });
  assert.deepEqual(getMultiFrameCapturePlan('light-trail'), {
    mode: 'light-trail',
    frameCount: 8,
  });
  assert.deepEqual(getMultiFrameCapturePlan('waterfall'), {
    mode: 'waterfall',
    frameCount: 6,
  });
  assert.equal(isMultiFrameCaptureMode('auto'), false);
  assert.equal(isMultiFrameCaptureMode('portrait'), false);
});

test('captures a cancellable burst and passes every frame to native processing', () => {
  assert.match(cameraScreenSource, /for \(let frameIndex = 0; frameIndex < frameCount;/);
  assert.match(cameraScreenSource, /MultiFrameProcessor\.processAsync/);
  assert.match(cameraScreenSource, /isCaptureLifecycleCurrent/);
  assert.match(cameraScreenSource, /setMultiFrameProgress/);
  assert.match(cameraScreenSource, /captureCanBeCancelled/);
});

test('Android aligns translations, rejects motion, and composites by mode', () => {
  assert.match(androidProcessorSource, /estimateTranslation/);
  assert.match(androidProcessorSource, /normalizedCorrelation/);
  assert.match(androidProcessorSource, /calculateMotionScore/);
  assert.match(androidProcessorSource, /shouldAcceptFrame/);
  assert.match(androidProcessorSource, /MODE_LIGHT_TRAIL/);
  assert.match(androidProcessorSource, /MODE_WATERFALL/);
});

test('iOS uses Vision registration before motion-aware compositing', () => {
  assert.match(iosProcessorSource, /VNTranslationalImageRegistrationRequest/);
  assert.match(iosProcessorSource, /alignmentTransform/);
  assert.match(iosProcessorSource, /calculateMotionScore/);
  assert.match(iosProcessorSource, /shouldAcceptFrame/);
});
