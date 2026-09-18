import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as adaptive from '../utils/adaptive-capture.mjs';

async function loadService(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, console,
    require(name) {
      assert.ok(name in dependencies, 'Unexpected runtime dependency: ' + name);
      return dependencies[name];
    },
  });
  return exports;
}

const capabilities = {
  platform: 'android', photoHDR: false, flash: true,
  processing: { multiFrame: true, portrait: true },
};
const settings = {
  modeId: 'star', photoQuality: 'maximum', hdr: true, flashMode: 'off',
  shutterSound: false, portraitEffect: false, aspectRatio: '4:3',
  timerSeconds: 0, zoom: 1, exposureCompensation: 0, focusExposureLocked: false,
};

test('merged per-mode resolvers preserve automatic bursts and supported manual capture', async () => {
  const star = await loadService('../services/star-capture.ts');
  const light = await loadService('../services/light-trail-capture.ts');
  const water = await loadService('../services/waterfall-capture.ts');
  assert.equal(star.resolveStarCapturePlan({ platform: 'android', supportsFrameStacking: true }).frameCount, 4);
  assert.equal(light.resolveLightTrailCapturePlan({ platform: 'android', supportsLightenCompositing: true }).frameCount, 8);
  assert.equal(water.resolveWaterfallCapturePlan({ platform: 'android', supportsTemporalAveraging: true }).frameCount, 8);
  const manual = star.resolveStarCapturePlan({
    platform: 'ios', supportsManualExposure: true, supportsManualFocus: true,
    exposureSecondsRange: { min: 0.01, max: 1 }, isoRange: { min: 50, max: 3200 },
  });
  assert.equal(manual.strategy, 'manual-long-exposure');
  assert.equal(manual.frameCount, 1);
  assert.equal(manual.exposureSeconds, 1);
});

test('merged metadata retains mode details, confirmed outcomes, and safe reference fallback', async () => {
  const service = await loadService('../services/capture-metadata.ts', {
    '@/modules/multi-frame-processor': { default: null, __esModule: true },
    '@/utils/adaptive-capture.mjs': adaptive,
  });
  const plan = adaptive.resolveCapturePlan(capabilities, settings);
  plan.resolved.frameCount = 4;
  const metadata = {
    ...service.createCaptureMetadata(plan, {
      captureMode: 'Star', facing: 'back', locationSaved: false,
      hdrConfirmed: true, nativeSettings: null,
    }),
    captureStrategy: 'automatic-frame-stack',
    manualExposureApplied: false,
  };
  const result = service.completeCaptureMetadata(metadata, 4, {
    applied: true, acceptedFrameCount: 3, rejectedFrameCount: 1,
  }, false, adaptive.emptySceneMeasurements());
  assert.equal(result.captureStrategy, 'automatic-frame-stack');
  assert.equal(result.hdr, false);
  assert.equal(result.capturePlan.requested.hdr, true);
  assert.equal(result.capturePlan.applied.frameCount, 3);
  assert.equal(result.capturePlan.applied.processing, 'star');
  assert.equal(result.rejectedFrameCount, 1);
  assert.ok(result.capturePlan.fallbacks.some((item) => item.reason === 'frames-rejected'));
  const fallback = service.completeCaptureMetadata(metadata, 4, {
    applied: false, acceptedFrameCount: 2,
  }, false, adaptive.emptySceneMeasurements(), 'alignment-rejected');
  assert.equal(fallback.acceptedFrameCount, 1);
  assert.equal(fallback.capturePlan.applied.processing, 'single');
  assert.equal(fallback.capturePlan.applied.frameCount, 1);
  assert.equal(fallback.rejectedFrameCount, 3);
});

test('merged screen routes raw bursts through alignment only once before crop and metadata', async () => {
  const source = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
  assert.equal((source.match(/useCapturePreparation\(/g) ?? []).length, 1);
  assert.doesNotMatch(source, /StarProcessor\.(stackAverageAsync|compositeLightenAsync)/);
  assert.match(source, /enqueuePhotoSave\(\s*capturedFramePaths,/);
  assert.match(source, /plan\.resolved\.frameCount = appliedCapturePlan\?\.frameCount/);
  assert.match(source, /completeCaptureMetadata\(/);
  assert.match(source, /measureCaptureScene\(/);
  assert.ok(source.indexOf('MultiFrameProcessor.processAsync(') < source.indexOf('const processedUri = await cropPhotoForAspectRatio('));
});

test('scene diagnostics start early and retain alignment measurements without a second native read', async () => {
  let finishMeasurement;
  let reads = 0;
  const measurement = {
    width: 3072, height: 2304, highlightClippingFraction: 0.04,
    highlightSampleCount: 49152, highlightThreshold: 250,
  };
  const service = await loadService('../services/capture-metadata.ts', {
    '@/modules/multi-frame-processor': {
      __esModule: true,
      default: { measureAsync(uri) {
        assert.equal(uri, 'file:///reference.jpg');
        reads += 1;
        return new Promise((resolve) => { finishMeasurement = resolve; });
      } },
    },
    '@/utils/adaptive-capture.mjs': adaptive,
  });
  const pending = service.startCaptureSceneMeasurement('file:///reference.jpg');
  assert.equal(reads, 1);
  const alignments = [
    { index: 0, offsetX: 0, offsetY: 0, motionScore: 0, accepted: true },
    { index: 1, offsetX: 2, offsetY: -1, motionScore: 0.03, accepted: true },
  ];
  const result = service.measureCaptureScene('file:///reference.jpg', alignments, pending);
  finishMeasurement(measurement);
  assert.equal(JSON.stringify(await result), JSON.stringify(adaptive.measureCapturedScene(measurement, alignments)));
  assert.equal(reads, 1);
});

test('early scene measurement keeps older-native and rejected-read fallbacks safe', async () => {
  for (const native of [null, {}, { measureAsync: async () => { throw new Error('read failed'); } }]) {
    const service = await loadService('../services/capture-metadata.ts', {
      '@/modules/multi-frame-processor': { default: native, __esModule: true },
      '@/utils/adaptive-capture.mjs': adaptive,
    });
    const pending = service.startCaptureSceneMeasurement('file:///reference.jpg');
    assert.equal(await pending, null);
    assert.equal(JSON.stringify(await service.measureCaptureScene('file:///reference.jpg', undefined, pending)),
      JSON.stringify(adaptive.emptySceneMeasurements()));
  }
});
