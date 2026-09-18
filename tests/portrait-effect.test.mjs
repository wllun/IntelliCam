import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cameraSource = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const metadataSource = await readFile(
  new URL('../services/photo-metadata.ts', import.meta.url),
  'utf8',
);
const captureMetadataSource = await readFile(new URL('../services/capture-metadata.ts', import.meta.url), 'utf8');
const moduleConfig = await readFile(
  new URL('../modules/portrait-effect/expo-module.config.json', import.meta.url),
  'utf8',
);
const androidBuild = await readFile(
  new URL('../modules/portrait-effect/android/build.gradle', import.meta.url),
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
const previewBlur = await readFile(
  new URL('../components/portrait-preview-blur.tsx', import.meta.url),
  'utf8',
);

test('Auto camera exposes an accessible Portrait effect beside Flash', () => {
  assert.match(cameraSource, /accessibilityLabel="Portrait effect"/);
  assert.match(cameraSource, /accessibilityRole="switch"/);
  assert.match(cameraSource, /name="aperture-outline"/);
  assert.ok(
    cameraSource.indexOf('accessibilityLabel={`Flash ${flash}`}')
      < cameraSource.indexOf('accessibilityLabel="Portrait effect"'),
  );
});

test('portrait processing runs before metadata embedding and save', () => {
  const processing = cameraSource.indexOf('PortraitEffect.applyAsync(');
  const metadata = cameraSource.indexOf('await embedPhotoMetadata(', processing);
  const save = cameraSource.indexOf('await savePhotoToAlbum(finalUri)', processing);

  assert.ok(processing >= 0);
  assert.ok(metadata > processing);
  assert.ok(save > metadata);
  assert.match(cameraSource, /completeCaptureMetadata\(/);
  assert.match(captureMetadataSource, /portraitEffectRequested: plan\?\.requested\.portraitEffect/);
  assert.match(captureMetadataSource, /portraitEffectApplied: completedPlan\?\.applied\.portraitEffect/);
  assert.match(cameraSource, /The original photo was saved/);
  assert.match(metadataSource, /row\('Portrait effect'/);
});

test('portrait effect has native Android and iOS implementations', () => {
  const config = JSON.parse(moduleConfig);
  assert.deepEqual(config.platforms, ['apple', 'android']);
  assert.match(androidBuild, /com\.google\.mlkit:segmentation-selfie:/);
  assert.match(androidModule, /SelfieSegmenterOptions/);
  assert.match(androidModule, /STREAM_MODE|SINGLE_IMAGE_MODE/);
  assert.match(androidBuild, /play-services-mlkit-subject-segmentation/);
  assert.match(androidModule, /blendSubjectPortrait/);
  assert.match(androidModule, /SubjectSegmentation.getClient/);
  assert.match(iosModule, /VNGenerateForegroundInstanceMaskRequest/);
  assert.match(iosModule, /generateScaledMaskForImage/);
  assert.match(iosModule, /CIGaussianBlur/);
  assert.match(iosModule, /CIBlendWithMask/);
});

test('Portrait uses subject outlines, not fixed sharp rectangles or person-only segmentation', () => {
  assert.match(cameraSource, /<PortraitPreviewBlur/);
  assert.match(cameraSource, /implementationMode=\{isAutoMode && portraitEffectEnabled \? 'compatible'/);
  assert.match(previewBlur, /BlurView/);
  assert.match(previewBlur, /MaskedView/);
  assert.match(previewBlur, /previewMaskAsync/);
  assert.match(previewBlur, /if \(!maskUri\) return null/);
  assert.match(previewBlur, /if \(running.current\)/);
  assert.match(previewBlur, /if \(cancelled\) return/);
  assert.match(previewBlur, /snapshot\?\.dispose/);
  assert.match(previewBlur, /retainedFiles.forEach\(removeTemporaryFile\)/);
  assert.doesNotMatch(previewBlur + androidModule + iosModule, /FOCUS_WIDTH_FRACTION|blendFocusPortrait|private func focusMask/);
  assert.match(cameraSource, /setPortraitTarget/);
  const androidPortrait = androidModule.split('private suspend fun applyPortraitEffect(')[1]
    .split('private suspend fun applyBeautyEffect(')[0];
  const iosPortrait = iosModule.split('private func applyPortraitEffect(')[1]
    .split('private func applyBeautyEffect(')[0];
  assert.doesNotMatch(androidPortrait, /hasPerson|SelfieSegmenterOptions/);
  assert.doesNotMatch(iosPortrait, /VNDetectHumanRectanglesRequest|VNGeneratePersonSegmentationRequest/);
});

test('Portrait checks native compatibility and waits for the Android model download', () => {
  assert.match(cameraSource, /subjectSegmentationVersion !== 2/);
  assert.match(cameraSource, /PortraitEffect.prepareAsync/);
  assert.match(cameraSource, /RNCMaskedView/);
  assert.match(androidModule, /ModuleInstallRequest/);
  assert.match(androidModule, /while \(!awaitTask\(installer.areModulesAvailable/);
  assert.match(androidModule, /withTimeout\(60_000\)/);
  assert.match(cameraSource, /Platform.OS === 'android' && appActive/);
});
