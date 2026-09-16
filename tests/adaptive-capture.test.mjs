import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { emptySceneMeasurements, finalizeCapturePlan, measureCapturedScene, resolveCapturePlan } from '../utils/adaptive-capture.mjs';

const capabilities = {
  deviceId: 'test-camera', platform: 'android', flash: true, photoHDR: true,
  processing: { multiFrame: true, portrait: true, sceneMeasurement: true },
};
const requested = {
  modeId: 'auto', photoQuality: 'maximum', hdr: true, flashMode: 'auto',
  shutterSound: false, portraitEffect: false, aspectRatio: '4:3', timerSeconds: 0,
  zoom: 1, exposureCompensation: 0, focusExposureLocked: false,
};
const measurement = {
  width: 3000, height: 2000, highlightClippingFraction: 0.15,
  highlightSampleCount: 4096, highlightThreshold: 250,
};
const frame = (overrides = {}) => ({
  index: 1, offsetX: 0, offsetY: 0, motionScore: 0.1, accepted: true,
  registrationSucceeded: true, ...overrides,
});

test('reuses the existing bounded computational mode plans', () => {
  for (const [modeId, frameCount] of [['star', 6], ['light-trail', 8], ['waterfall', 6]]) {
    const plan = resolveCapturePlan(capabilities, { ...requested, modeId });
    assert.equal(plan.resolved.processing, modeId);
    assert.equal(plan.resolved.frameCount, frameCount);
    assert.equal(plan.applied.frameCount, 0);
  }
  assert.equal(resolveCapturePlan(capabilities, { ...requested, modeId: '__proto__' }).resolved.frameCount, 1);
});

test('preserves user requests while recording capability fallbacks', () => {
  const plan = resolveCapturePlan({ ...capabilities, flash: false, photoHDR: false,
    processing: { multiFrame: false, portrait: false } },
  { ...requested, modeId: 'star', portraitEffect: true });
  assert.equal(plan.requested.hdr, true);
  assert.equal(plan.resolved.hdr, false);
  assert.equal(plan.resolved.flashMode, 'off');
  assert.equal(plan.resolved.processing, 'single');
  assert.equal(plan.resolved.frameCount, 1);
  assert.deepEqual(plan.fallbacks.map((item) => item.reason), [
    'camera-hdr-unavailable', 'camera-flash-unavailable',
    'portrait-toggle-auto-only', 'multi-frame-module-unavailable',
  ]);
});

test('does not equate a resolved HDR request with applied HDR', () => {
  const plan = resolveCapturePlan(capabilities, requested);
  assert.equal(plan.applied.hdr, false);
  const completed = finalizeCapturePlan(plan, {
    hdrConfirmed: false, acceptedFrameCount: 1, multiFrameApplied: false, portraitApplied: false,
  });
  assert.equal(completed.applied.hdr, false);
  assert.equal(completed.fallbacks[0].reason, 'hdr-session-not-confirmed');
  assert.equal(plan.fallbacks.length, 0);
});

test('records processor rejection and original-frame fallback without mutating the plan', () => {
  const plan = resolveCapturePlan(capabilities, { ...requested, modeId: 'waterfall' });
  const completed = finalizeCapturePlan(plan, {
    hdrConfirmed: true, acceptedFrameCount: 1, multiFrameApplied: false,
    portraitApplied: false, multiFrameFailureReason: 'alignment-failed',
  });
  assert.equal(completed.applied.processing, 'single');
  assert.equal(completed.fallbacks[0].reason, 'alignment-failed');
  assert.equal(plan.resolved.frameCount, 6);
  assert.equal(plan.applied.frameCount, 0);
});

test('records partial frame rejection and preserves the reported native settings snapshot', () => {
  const plan = resolveCapturePlan(capabilities, { ...requested, modeId: 'star' });
  plan.applied.native = { source: 'controller-at-shutter', zoom: 0.6, exposureBias: 2,
    exposureBiasUnit: 'native-index' };
  const completed = finalizeCapturePlan(plan, {
    hdrConfirmed: true, acceptedFrameCount: 4, multiFrameApplied: true, portraitApplied: false,
  });
  assert.equal(completed.applied.processing, 'star');
  assert.equal(completed.applied.frameCount, 4);
  assert.equal(completed.applied.native.zoom, 0.6);
  assert.deepEqual(completed.fallbacks, [{
    setting: 'frameCount', requested: 6, resolved: 4, reason: 'frames-rejected',
  }]);
  assert.equal(plan.fallbacks.length, 0);
});

test('reports single-frame stability as unknown and preserves measured clipping', () => {
  const scene = measureCapturedScene(measurement, [], '2026-09-16T00:00:00Z');
  assert.equal(scene.highlightClipping.fraction, 0.15);
  assert.equal(scene.highlightClipping.source, 'captured-jpeg');
  assert.equal(scene.stability.status, 'unknown');
  assert.equal(scene.phase, 'captured-reference');
  assert.deepEqual(measureCapturedScene(undefined), emptySceneMeasurements());
});

test('normalizes registration displacement and separates subject motion', () => {
  const steady = measureCapturedScene(measurement, [frame()]);
  assert.equal(steady.stability.status, 'steady');
  assert.equal(steady.stability.residualMotionFraction, 0.1);
  const moving = measureCapturedScene(measurement, [frame({ offsetX: 60 })]);
  assert.equal(moving.stability.status, 'moving');
  assert.equal(moving.stability.displacementFraction, 0.02);
  const unstable = measureCapturedScene(measurement, [frame({ accepted: false })]);
  assert.equal(unstable.stability.status, 'unstable');
});

test('does not label failed registrations as steady or invalid measurements as valid', () => {
  const failed = measureCapturedScene(measurement, [frame({
    accepted: false, registrationSucceeded: false, motionScore: 1,
  })]);
  assert.equal(failed.stability.status, 'unknown');
  assert.equal(failed.stability.registeredFrameCount, 0);
  assert.equal(failed.stability.rejectedFrameFraction, 1);
  assert.equal(measureCapturedScene({ ...measurement, highlightClippingFraction: NaN }).highlightClipping.fraction, null);
  assert.equal(measureCapturedScene(measurement, [frame({ offsetX: NaN })]).stability.status, 'unknown');
});

test('both native backends measure highlights and metadata shows plan outcomes', async () => {
  const android = await readFile(new URL('../modules/multi-frame-processor/android/src/main/java/expo/modules/multiframeprocessor/MultiFrameProcessorModule.kt', import.meta.url), 'utf8');
  const ios = await readFile(new URL('../modules/multi-frame-processor/ios/MultiFrameProcessorModule.swift', import.meta.url), 'utf8');
  for (const source of [android, ios]) {
    assert.match(source, /AsyncFunction\("measureAsync"\)/);
    assert.match(source, /highlightClippingFraction/);
    assert.match(source, /highlightSampleCount/);
    assert.match(source, /registrationSucceeded/);
  }
  const camera = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(camera, /photoOutput\.prepareSettings\(/);
  assert.match(camera, /plan\.resolved\.frameCount/);
  const metadata = await readFile(new URL('../services/photo-metadata.ts', import.meta.url), 'utf8');
  assert.match(metadata, /title: 'Capture engine'/);
  assert.match(metadata, /plan\.fallbacks/);
});
