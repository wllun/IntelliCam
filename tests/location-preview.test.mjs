import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const start = source.indexOf('  const toggleLocationMetadata = async () => {');
const end = source.indexOf('  const cancelPendingCapture =', start);
assert.ok(start >= 0 && end > start);
const { outputText } = ts.transpileModule(`${source.slice(start, end)}\nexports.toggle = toggleLocationMetadata;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function harness({ enabled = false, permission = { granted: true, canAskAgain: true },
  requested = { granted: true }, query } = {}) {
  const calls = { queries: 0, requests: 0, alerts: 0 };
  const exports = {};
  const pending = { current: false };
  const focused = { current: true };
  const coordinates = { current: { latitude: 1, longitude: 2 } };
  const context = {
    exports, locationEnabled: enabled, locationPermissionPendingRef: pending,
    captureLocationRef: coordinates, screenFocusedRef: focused,
    setLocationEnabled(value) { context.locationEnabled = value; },
    setCaptureLocation(value) { context.captureLocation = value; },
    Haptics: { selectionAsync: async () => {} },
    Alert: { alert() { calls.alerts++; } }, console: { warn() {} },
    Location: {
      async getForegroundPermissionsAsync() { calls.queries++; return query ? query() : permission; },
      async requestForegroundPermissionsAsync() { calls.requests++; return requested; },
    },
  };
  runInNewContext(outputText, context);
  return { toggle: exports.toggle, calls, context, pending, focused, coordinates };
}

test('enabling photo location reuses granted permission without requesting another dialog', async () => {
  const h = harness();
  await h.toggle();
  assert.equal(h.context.locationEnabled, true);
  assert.deepEqual(h.calls, { queries: 1, requests: 0, alerts: 0 });
  assert.equal(h.pending.current, false);
});

test('requests missing permission only when allowed and leaves denied access off', async () => {
  const allowed = harness({ permission: { granted: false, canAskAgain: true } });
  await allowed.toggle();
  assert.equal(allowed.calls.requests, 1);
  assert.equal(allowed.context.locationEnabled, true);
  const denied = harness({ permission: { granted: false, canAskAgain: false } });
  await denied.toggle();
  assert.equal(denied.calls.requests, 0);
  assert.equal(denied.calls.alerts, 1);
  assert.equal(denied.context.locationEnabled, false);
});

test('rapid taps share one permission operation and ignore a departed screen', async () => {
  let resolve;
  const result = new Promise((r) => { resolve = r; });
  const h = harness({ query: () => result });
  const first = h.toggle();
  await h.toggle();
  assert.equal(h.calls.queries, 1);
  h.focused.current = false;
  resolve({ granted: true });
  await first;
  assert.equal(h.context.locationEnabled, false);
  assert.equal(h.pending.current, false);
});

test('permission failures release the operation guard and disabling clears coordinates immediately', async () => {
  const failed = harness({ query: async () => { throw new Error('Unavailable'); } });
  await failed.toggle();
  assert.equal(failed.calls.alerts, 1);
  assert.equal(failed.pending.current, false);
  assert.equal(failed.context.locationEnabled, false);
  const enabled = harness({ enabled: true });
  await enabled.toggle();
  assert.equal(enabled.context.locationEnabled, false);
  assert.equal(enabled.coordinates.current, undefined);
  assert.equal(enabled.context.captureLocation, undefined);
  assert.equal(enabled.calls.queries, 0);
});

test('permission interruptions retain the preview surface while background capture stays disabled', () => {
  assert.match(source, /\{cameraDevice && \(\s*<Camera/);
  assert.match(source, /isActive=\{appActive && screenFocused\}/);
  assert.match(source, /if \(!active\) \{\s*cameraReadyRef\.current = false;\s*setCameraReady\(false\);\s*cancelPendingCapture\(\)/);
  assert.match(source, /mayShowUserSettingsDialog: false/);
});
