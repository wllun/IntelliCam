import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cameraScreenSource = await readFile(
  new URL('../app/index.tsx', import.meta.url),
  'utf8',
);
const preparationSource = await readFile(new URL('../services/capture-preparation.ts', import.meta.url), 'utf8');
const preparationHook = await readFile(new URL('../hooks/use-capture-preparation.ts', import.meta.url), 'utf8');
const planSource = await readFile(new URL('../utils/adaptive-capture.mjs', import.meta.url), 'utf8');
const androidMultiFrameSource = await readFile(new URL(
  '../modules/multi-frame-processor/android/src/main/java/expo/modules/multiframeprocessor/MultiFrameProcessorModule.kt',
  import.meta.url,
), 'utf8');
const iosMultiFrameSource = await readFile(new URL(
  '../modules/multi-frame-processor/ios/MultiFrameProcessorModule.swift',
  import.meta.url,
), 'utf8');

test('always captures maximum quality through shared native preparation', () => {
  assert.match(cameraScreenSource, /useCapturePreparation\(/);
  assert.match(cameraScreenSource, /cameraReady, 'maximum'/);
  assert.match(preparationSource, /CommonResolutions\.HIGHEST_4_3/);
  assert.match(preparationSource, /qualityPrioritization:/);
  assert.doesNotMatch(cameraScreenSource, /PHOTO_QUALITY_OPTIONS|setPhotoQuality/);
});

test('uses available native enhancement controls for maximum quality', () => {
  assert.match(preparationHook, /enableLowLightBoost:/);
  assert.match(preparationSource, /supportsLowLightBoost/);
  assert.match(preparationSource, /enableDistortionCorrection:/);
  assert.match(preparationSource, /enableVirtualDeviceFusion:/);
  assert.match(planSource, /photoQuality === 'maximum' \? 100 : 92/);
  assert.match(cameraScreenSource, /plan\.resolved\.jpegQuality/);
});

test('keeps full-resolution JPEG capture while minimizing plain Auto shutter latency', () => {
  assert.match(preparationSource, /preferResponsiveCapture && !hdr/);
  assert.match(preparationSource, /\? 'balanced'/);
  assert.match(cameraScreenSource, /activeCaptureModeId === DEFAULT_CAPTURE_MODE_ID/);
  assert.match(cameraScreenSource, /!portraitEffectEnabled/);
  assert.match(cameraScreenSource, /onWillCapturePhoto:/);
  assert.match(cameraScreenSource, /enableRedEyeReduction: !isFlashDisabledForMode && plan\.resolved\.flashMode !== 'off'/);
  assert.doesNotMatch(preparationSource, /qualityPrioritization:[^\n]*'speed'/);
});

test('raises computational output resolution adaptively without risking low-memory devices', () => {
  assert.match(androidMultiFrameSource, /maximumHeapMb >= 512L -> HIGH_MEMORY_OUTPUT_EDGE/);
  assert.match(androidMultiFrameSource, /HIGH_MEMORY_OUTPUT_EDGE = 4096/);
  assert.match(androidMultiFrameSource, /else -> BASE_OUTPUT_EDGE/);
  assert.match(iosMultiFrameSource, /physicalMemory >= 4 \* 1024 \* 1024 \* 1024 \{ return 4096 \}/);
  assert.match(iosMultiFrameSource, /return 3072/);
});
