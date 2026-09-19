import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { isCaptureLifecycleCurrent } from '../utils/capture-lifecycle.mjs';

const cameraSource = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');

const expected = { sessionId: 8, cameraDeviceId: 'rear-wide' };
const active = {
  ...expected,
  appActive: true,
  screenFocused: true,
  cameraReady: true,
};

test('accepts a capture only while its exact camera lifecycle remains current', () => {
  assert.equal(isCaptureLifecycleCurrent(expected, active), true);
  assert.equal(isCaptureLifecycleCurrent(expected, { ...active, appActive: false }), false);
  assert.equal(isCaptureLifecycleCurrent(expected, { ...active, screenFocused: false }), false);
  assert.equal(isCaptureLifecycleCurrent(expected, { ...active, cameraReady: false }), false);
  assert.equal(isCaptureLifecycleCurrent(expected, { ...active, sessionId: 9 }), false);
  assert.equal(isCaptureLifecycleCurrent(expected, { ...active, cameraDeviceId: 'front' }), false);
});

test('backgrounding and route blur invalidate capture before native work can be accepted', () => {
  assert.match(cameraSource, /AppState\.addEventListener\('change',[\s\S]*?if \(!active\) \{[\s\S]*?cancelPendingCapture\(\)/);
  assert.match(cameraSource, /useFocusEffect\([\s\S]*?screenFocusedRef\.current = false;[\s\S]*?cancelPendingCapture\(\)/);
  assert.match(cameraSource, /isActive=\{appActive && screenFocused\}/);
});

test('front, rear and dedicated lens changes invalidate capture immediately', () => {
  const dedicatedLensSwitch = cameraSource.slice(
    cameraSource.indexOf("if (facing === 'back' && option.device.id !== cameraDevice?.id)"),
    cameraSource.indexOf('} else if (animated)', cameraSource.indexOf("if (facing === 'back' && option.device.id !== cameraDevice?.id)")),
  );
  assert.ok(dedicatedLensSwitch.indexOf('cancelPendingCapture()') < dedicatedLensSwitch.indexOf('setSelectedBackDeviceId('));

  const facingSwitch = cameraSource.slice(
    cameraSource.indexOf('accessibilityLabel="Flip camera"'),
    cameraSource.indexOf('style={styles.roundControl}', cameraSource.indexOf('accessibilityLabel="Flip camera"')),
  );
  assert.ok(facingSwitch.indexOf('cancelPendingCapture()') < facingSwitch.indexOf('setFacing('));
});

test('a late native JPEG is owned before validation and deleted instead of being saved', () => {
  const captureStart = cameraSource.indexOf('const capture = async () =>');
  const captureEnd = cameraSource.indexOf('const captureCanBeCancelled', captureStart);
  const capture = cameraSource.slice(captureStart, captureEnd);
  const nativeCapture = capture.indexOf('await photoOutput.capturePhotoToFile(');
  const ownFile = capture.indexOf('capturedFramePaths.push(photoFile.filePath)', nativeCapture);
  const validate = capture.indexOf('if (!captureLifecycleIsCurrent()) return;', ownFile);
  const enqueue = capture.indexOf('enqueuePhotoSave(', validate);

  assert.ok(nativeCapture >= 0 && ownFile > nativeCapture && validate > ownFile && enqueue > validate);
  assert.match(capture, /if \(!saveEnqueued\) \{\s*removeTemporaryCaptureFiles\(capturedFramePaths\);\s*\}/);
  assert.ok(capture.indexOf('saveEnqueued = true;', enqueue) > enqueue);
});

test('post-capture work may finish safely without updating an unmounted screen', () => {
  assert.match(cameraSource, /componentMountedRef\.current = false/);
  assert.match(cameraSource, /if \(componentMountedRef\.current\) \{\s*setLatestPhoto\(savedPhoto\)/);
  assert.match(cameraSource, /componentMountedRef\.current && latestCaptureRef\.current === captureId[\s\S]*?appActiveRef\.current && screenFocusedRef\.current/);
});
