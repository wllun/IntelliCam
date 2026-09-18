import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate as flush } from 'node:timers/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../components/portrait-preview-blur.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

// Exercise the real async preview effect with native images, files and React hooks
// mocked. These tests do not substitute for on-device segmentation/rendering QA.
function previewHarness(processFrame, snapshotDuration = 0, disposalFails = false) {
  const states = [];
  const statuses = [];
  const deleted = [];
  const warnings = [];
  const timers = new Map();
  let clock = 0;
  let effect;
  let disposed = 0;
  const small = {
    saveToTemporaryFileAsync: async () => 'file:///snapshot.jpg',
    dispose: () => { disposed++; if (disposalFails) throw new Error('native image released'); },
  };
  const snapshot = {
    width: 1080, height: 1920,
    resizeAsync: async () => small,
    dispose: () => { disposed++; if (disposalFails) throw new Error('native image released'); },
  };
  const mocks = {
    react: {
      memo: (component) => component,
      useEffect: (setup) => { effect = setup; },
      useRef: (value) => ({ current: value }),
      useState: () => [undefined, (value) => states.push(value)],
    },
    'react-native': { StyleSheet: { absoluteFill: {} } },
    'react/jsx-runtime': { jsx: () => ({}) },
    'expo-file-system': {
      File: class {
        constructor(uri) { this.uri = uri; }
        exists = true;
        delete() { deleted.push(this.uri); }
      },
    },
    '@/modules/portrait-effect': { default: { previewBackgroundAsync: processFrame } },
  };
  const exports = {};
  new Function('require', 'exports', 'setTimeout', 'clearTimeout', 'Date', 'console', compiled)(
    (name) => {
      assert.ok(name in mocks, `Unexpected preview dependency: ${name}`);
      return mocks[name];
    },
    exports,
    (fn) => { const id = Symbol(); timers.set(id, fn); return id; },
    (id) => timers.delete(id),
    { now: () => clock },
    { warn: (...args) => warnings.push(args) },
  );
  exports.PortraitPreviewBlur({
    width: 360, height: 640, focusX: 0.5, focusY: 0.5, sceneKey: 'rear',
    getSnapshot: async () => { clock += snapshotDuration; return snapshot; },
    onStatus: (status) => statuses.push(status),
  });
  const cleanup = effect();
  return { states, statuses, deleted, warnings, timers, cleanup, disposed: () => disposed };
}

test('preview accepts a successful 1.8-second sample instead of silently dropping it', async () => {
  const h = previewHarness(async () => ({ uri: 'file:///background.png', applied: true }), 1800);
  await flush();
  assert.equal(h.states.at(-1), 'file:///background.png');
  assert.equal(h.statuses.at(-1), undefined);
  assert.equal(h.disposed(), 2);
  assert.deepEqual(h.deleted, ['file:///snapshot.jpg']);
  h.cleanup();
  assert.ok(h.deleted.includes('file:///background.png'));
  assert.equal(h.timers.size, 0);
});

test('missing subjects clear the overlay and explain how to recover', async () => {
  const h = previewHarness(async () => ({ uri: '', applied: false }));
  await flush();
  assert.equal(h.states.at(-1), undefined);
  assert.match(h.statuses.at(-1), /No Portrait subject found/);
  assert.equal(h.disposed(), 2);
  h.cleanup();
});

test('native preview failures are visible and logged, without disabling saved-photo processing', async () => {
  const h = previewHarness(async () => { throw new Error('model failed'); });
  await flush();
  assert.match(h.statuses.at(-1), /saved-photo processing remains enabled/);
  assert.equal(h.warnings.length, 1);
  assert.equal(h.disposed(), 2);
  assert.deepEqual(h.deleted, ['file:///snapshot.jpg']);
  h.cleanup();
});

test('closing the preview during processing ignores the late frame and deletes its file', async () => {
  let finish;
  const h = previewHarness(() => new Promise((resolve) => { finish = resolve; }));
  await flush();
  h.cleanup();
  const updates = h.states.length;
  finish({ uri: 'file:///late.png', applied: true });
  await flush();
  assert.equal(h.states.length, updates);
  assert.equal(h.statuses.at(-1), undefined);
  assert.ok(h.deleted.includes('file:///late.png'));
  assert.equal(h.disposed(), 2);
  assert.equal(h.timers.size, 0);
});

test('very stale samples remain clear and report slow processing', async () => {
  const h = previewHarness(async () => ({ uri: 'file:///stale.png', applied: true }), 5000);
  await flush();
  assert.equal(h.states.at(-1), undefined);
  assert.match(h.statuses.at(-1), /preview is slow/);
  assert.ok(h.deleted.includes('file:///stale.png'));
  h.cleanup();
});

test('native image cleanup errors do not reject the preview loop or prevent other cleanup', async () => {
  const h = previewHarness(async () => { throw new Error('camera stopped'); }, 0, true);
  await flush();
  assert.equal(h.disposed(), 2);
  assert.match(h.statuses.at(-1), /saved-photo processing remains enabled/);
  assert.deepEqual(h.deleted, ['file:///snapshot.jpg']);
  assert.equal(h.timers.size, 1, 'sampling should still schedule a retry');
  h.cleanup();
  assert.equal(h.timers.size, 0);
});
