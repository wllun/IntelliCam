import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cameraSource = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const presetsSource = await readFile(new URL('../constants/presets.ts', import.meta.url), 'utf8');
const modesSource = await readFile(new URL('../constants/capture-modes.ts', import.meta.url), 'utf8');
const metadataSource = await readFile(new URL('../services/photo-metadata.ts', import.meta.url), 'utf8');
const nativeBinding = await readFile(
  new URL('../modules/portrait-effect/src/PortraitEffectModule.ts', import.meta.url),
  'utf8',
);
const androidModule = await readFile(
  new URL(
    '../modules/portrait-effect/android/src/main/java/expo/modules/portraiteffect/PortraitEffectModule.kt',
    import.meta.url,
  ),
  'utf8',
);
const iosModule = await readFile(
  new URL('../modules/portrait-effect/ios/PortraitEffectModule.swift', import.meta.url),
  'utf8',
);

test('Beauty is presented in English as an executable capture mode', () => {
  assert.match(presetsSource, /id: 'beauty',[\s\S]*name: 'Beauty'/);
  assert.match(modesSource, /beauty: {[\s\S]*name: 'Beauty'/);
  assert.doesNotMatch(`${presetsSource}\n${modesSource}`, /美顔/);
  assert.match(cameraSource, /const isBeautyMode = activeCaptureModeId === 'beauty'/);
  assert.match(cameraSource, /strategy: 'natural-beauty-processing'/);
  assert.match(cameraSource, /isBeautyMode \? 'beauty'/);
});

test('Beauty processing runs before metadata embedding and gallery save', () => {
  const processing = cameraSource.indexOf('PortraitEffect.applyBeautyAsync(processedUri, jpegQuality)');
  const metadata = cameraSource.indexOf('await embedPhotoMetadata(', processing);
  const save = cameraSource.indexOf('await savePhotoToAlbum(finalUri)', processing);

  assert.ok(processing >= 0);
  assert.ok(metadata > processing);
  assert.ok(save > metadata);
  assert.match(cameraSource, /beautyEffectRequested: applyBeautyEffect/);
  assert.match(cameraSource, /beautyEffectApplied: beautyApplied/);
  assert.match(cameraSource, /The original photo was saved/);
  assert.match(metadataSource, /row\('Beauty effect'/);
});

test('Beauty effect has offline native Android and iOS implementations', () => {
  assert.match(nativeBinding, /applyBeautyAsync/);
  assert.match(androidModule, /AsyncFunction\("applyBeautyAsync"\)/);
  assert.match(androidModule, /SelfieSegmenterOptions/);
  assert.match(androidModule, /skinLikelihood/);
  assert.match(iosModule, /AsyncFunction\("applyBeautyAsync"\)/);
  assert.match(iosModule, /VNDetectFaceRectanglesRequest/);
  assert.match(iosModule, /CINoiseReduction/);
  assert.match(iosModule, /CIBlendWithMask/);
});
