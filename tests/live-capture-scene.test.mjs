import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as environment from '../utils/environment-capture.mjs';

async function sampler(platform = 'android', nativeAvailable = true) {
  const source = await readFile(new URL('../hooks/use-live-capture-scene.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const refs = [];
  let cursor = 0;
  let snapshots = 0;
  let analyses = 0;
  let deleted = 0;
  let time = 10000;
  let failSnapshot = false;
  const image = { resizeAsync: async () => image, saveToTemporaryFileAsync: async () => '/sample.jpg', dispose() {} };
  const cameraRef = { current: { controller: { exposureDuration: 0.01, iso: 100 },
    takeSnapshot: async () => { snapshots++; if (failSnapshot) throw new Error('snapshot unavailable'); return image; } } };
  const dependencies = {
    react: { useRef(value) { return refs[cursor++] ??= { current: value }; },
      useEffect() {}, useCallback(callback) { return callback; } },
    'react-native': { Platform: { OS: platform } },
    'expo-file-system': { File: class { exists = true; delete() { deleted++; } } },
    '@/utils/environment-capture.mjs': environment,
    '@/modules/multi-frame-processor': { __esModule: true, default: nativeAvailable ? {
      sampleMotionAsync: async () => ({ gyroRms: 0.01, gyroSamples: 6 }),
      analyzePreviewAsync: async () => { analyses++; return { meanLuma: 0.2, highlightFraction: 0.01,
        texture: 0.1, subjectMotion: null, lightMotion: null, lightSpeed: null, displacement: null }; },
    } : null },
  };
  const exports = {};
  vm.runInNewContext(outputText, { exports, Date: { now: () => time }, setTimeout, clearTimeout,
    require(name) { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  return {
    render(key = 'camera', enabled = true) { cursor = 0; return exports.useLiveCaptureScene(cameraRef, enabled, true, key); },
    stats: () => ({ snapshots, analyses, deleted }),
    advance: (ms) => { time += ms; },
    fail: () => { failSnapshot = true; },
  };
}

test('shutter sampling is single-flight, deletes its cache image and reuses only fresh same-context data', async () => {
  const harness = await sampler();
  let hook = harness.render();
  const [a, b] = await Promise.all([hook.getAtShutter(), hook.getAtShutter()]);
  assert.equal(a.meanLuma, b.meanLuma);
  assert.deepEqual(harness.stats(), { snapshots: 1, analyses: 1, deleted: 1 });
  await hook.getAtShutter();
  assert.equal(harness.stats().snapshots, 1);
  hook = harness.render('other-camera');
  await hook.getAtShutter();
  assert.equal(harness.stats().snapshots, 2);
  harness.advance(1000);
  await hook.getAtShutter();
  assert.equal(harness.stats().snapshots, 3);
});

test('iOS and older clients never claim measured preview highlights or subject motion', async () => {
  for (const [platform, native] of [['ios', true], ['android', false]]) {
    const harness = await sampler(platform, native);
    const scene = await harness.render().getAtShutter();
    assert.equal(scene.meanLuma, null);
    assert.equal(scene.highlightFraction, null);
    assert.equal(scene.subjectMotion, null);
    assert.equal(harness.stats().snapshots, 0);
    if (platform === 'ios') {
      assert.equal(scene.meteredISO, 100);
      assert.equal(scene.gyroSamples, 6);
    }
  }
});

test('inactive and failed preview sampling return explicit safe fallbacks', async () => {
  const harness = await sampler();
  assert.equal((await harness.render('camera', false).getAtShutter()).source, 'unavailable');
  assert.equal(harness.stats().snapshots, 0);
  harness.fail();
  const failed = await harness.render().getAtShutter();
  assert.equal(failed.source, 'unavailable');
  assert.equal(failed.reason, 'preview-analysis-failed');
});
