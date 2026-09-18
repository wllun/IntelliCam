import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveEnvironmentCapture, unavailableLiveScene } from '../utils/environment-capture.mjs';

const now = 100000;
const scene = (override = {}) => ({ ...unavailableLiveScene(), sampledAt: now, source: 'preview-snapshot',
  meanLuma: 0.1, highlightFraction: 0, texture: 0.1, subjectMotion: 0.01,
  lightMotion: 0.1, lightSpeed: 0.03, displacement: 0, gyroRms: 0.005, gyroSamples: 6, ...override });
const burst = { frameCount: 8 };
const manual = { frameCount: 1, exposureSeconds: 15, iso: 800, lockFocusAtInfinity: true };
const ranges = { exposure: { min: 0.001, max: 30 }, iso: { min: 50, max: 3200 } };
const resolve = (mode, base, sample) => resolveEnvironmentCapture(mode, base, sample, ranges, now);

test('Star adapts frame count to darkness, phone stability and residual movement', () => {
  assert.equal(resolve('star', burst, scene()).frameCount, 8);
  assert.equal(resolve('star', burst, scene({ meanLuma: 0.7 })).frameCount, 3);
  assert.equal(resolve('star', burst, scene({ gyroRms: 0.2 })).frameCount, 3);
  assert.equal(resolve('star', burst, scene({ subjectMotion: 0.4 })).frameCount, 3);
  const supported = resolve('star', manual, scene());
  assert.equal(supported.exposureSeconds, 15);
  assert.equal(supported.iso, 800);
  assert.equal(supported.focusStrategy, 'infinity');
  assert.equal(resolve('star', manual, scene({ meanLuma: 0.7 })).focusStrategy, 'automatic');
});

test('Light Trail closes frame gaps for fast moving lights and protects highlights', () => {
  const slow = resolve('light-trail', burst, scene());
  const fast = resolve('light-trail', burst, scene({ lightSpeed: 0.3 }));
  assert.ok(fast.frameIntervalMs < slow.frameIntervalMs);
  assert.equal(fast.frameCount, 12);
  assert.equal(resolve('light-trail', burst, scene({ highlightFraction: 0.1 })).exposureCompensation, -1.5);
});

test('Waterfall adapts smoothing, spacing and highlight protection without changing image quality', () => {
  const motion = resolve('waterfall', burst, scene({ subjectMotion: 0.4 }));
  assert.equal(motion.frameCount, 10);
  assert.equal(motion.frameIntervalMs, 100);
  const bright = resolve('waterfall', { frameCount: 1, exposureSeconds: 1, iso: 50 }, scene({ meanLuma: 0.8 }));
  assert.equal(bright.exposureSeconds, 0.25);
  assert.equal(bright.iso, 50);
  assert.equal(resolve('waterfall', burst, scene({ gyroRms: 0.2 })).frameCount, 4);
  assert.equal('jpegQuality' in motion, false);
  assert.equal('resolution' in motion, false);
});

test('stale, invalid and missing measurements keep safe base plans and never imply a tripod', () => {
  for (const value of [null, unavailableLiveScene(), scene({ sampledAt: now - 2000 }),
    scene({ sampledAt: now + 500 }), scene({ meanLuma: NaN, gyroRms: null, gyroSamples: 0 })]) {
    const result = resolve('star', manual, value);
    assert.equal(result.exposureSeconds, manual.exposureSeconds);
    assert.equal(result.iso, manual.iso);
    assert.ok(result.reasons.includes('stability-unknown'));
  }
  const blank = resolve('star', burst, scene({ meanLuma: 0, texture: 0, gyroRms: null, gyroSamples: 0 }));
  assert.equal(blank.frameCount, 4);
  assert.ok(blank.reasons.includes('stability-unknown'));
});

test('manual settings respect native limits and compensate shutter changes within ISO limits', () => {
  const result = resolveEnvironmentCapture('star', manual, scene(), {
    exposure: { min: 0.001, max: 1 }, iso: { min: 50, max: 1600 },
  }, now);
  assert.equal(result.exposureSeconds, 1);
  assert.equal(result.iso, 1600);
  assert.ok(result.reasons.includes('hardware-shutter-limit'));
  const unavailable = resolveEnvironmentCapture('star', manual, scene(), {}, now);
  assert.equal(unavailable.exposureSeconds, undefined);
  assert.ok(unavailable.reasons.includes('manual-ranges-unavailable'));
  const automatic = resolve('star', burst, scene());
  assert.equal(automatic.iso, undefined);
  assert.equal(automatic.exposureSeconds, undefined);
});

test('iOS metering-only fallback adapts supported exposure without fabricating preview measurements', () => {
  const input = scene({ source: 'metering-only', meanLuma: null, highlightFraction: null,
    meteredExposureSeconds: 0.01, meteredISO: 100, reason: 'ios-preview-snapshot-unavailable' });
  const result = resolve('light-trail', { frameCount: 1, exposureSeconds: 4, iso: 100 }, input);
  assert.ok(result.exposureSeconds < 0.25);
  assert.ok(result.reasons.includes('camera-metered-exposure-product'));
  assert.equal(result.scene.highlightFraction, null);
});

test('decision is deterministic, bounded and does not mutate caller data', () => {
  const base = Object.freeze({ frameCount: 8 });
  const input = Object.freeze(scene());
  assert.deepEqual(resolve('light-trail', base, input), resolve('light-trail', base, input));
  assert.equal(input.lightSpeed, 0.03);
  for (const mode of ['star', 'light-trail', 'waterfall']) {
    for (const mean of [0, 0.2, 0.5, 1]) {
      const result = resolve(mode, base, scene({ meanLuma: mean }));
      assert.ok(result.frameCount >= 2 && result.frameCount <= 12);
      assert.ok(result.frameIntervalMs >= 0 && result.frameIntervalMs <= 600);
      assert.ok(result.maxBurstMs <= 18000);
    }
  }
});
