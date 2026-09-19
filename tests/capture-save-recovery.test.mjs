import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cameraSource = await readFile(new URL('../app/index.tsx', import.meta.url), 'utf8');
const recoverySource = await readFile(
  new URL('../services/capture-save-recovery.ts', import.meta.url),
  'utf8',
);
const reviewSource = await readFile(
  new URL('../components/capture-review-card.tsx', import.meta.url),
  'utf8',
);

test('retains every captured original outside purgeable cache before processing', () => {
  assert.match(recoverySource, /new Directory\(Paths\.document, RECOVERY_DIRECTORY_NAME\)/);
  assert.match(recoverySource, /source\.copy\(destination\)/);
  assert.match(recoverySource, /listCaptureRecoveries/);
  assert.ok(
    cameraSource.indexOf('retainCaptureForRecovery(referenceFilePath, captureId)')
      < cameraSource.indexOf('MultiFrameProcessor.processAsync('),
  );
});

test('replaces a retained original only after the processed copy exists', () => {
  const replacement = recoverySource.slice(
    recoverySource.indexOf('export function replaceRecoveryPhoto'),
    recoverySource.indexOf('export function listCaptureRecoveries'),
  );
  assert.ok(replacement.indexOf('source.copy(replacement)') < replacement.indexOf('previous.delete()'));
  assert.match(cameraSource, /recovery = replaceRecoveryPhoto\(finalUri, recovery\)/);
});

test('saves from the retained file and updates the gallery thumbnail only after success', () => {
  const captured = cameraSource.slice(
    cameraSource.indexOf('latestCaptureRef.current = captureSession'),
    cameraSource.indexOf('enqueuePhotoSave(', cameraSource.indexOf('latestCaptureRef.current = captureSession')),
  );
  assert.match(captured, /setCaptureReview\(/);
  assert.match(captured, /status: 'processing'/);
  assert.doesNotMatch(captured, /setLatestPhoto\(/);

  const save = cameraSource.indexOf('await savePhotoToAlbum(recovery.uri)');
  const thumbnail = cameraSource.indexOf('setLatestPhoto(savedPhoto)', save);
  const cleanup = cameraSource.indexOf('discardCaptureRecovery(recovery)', save);
  assert.ok(save >= 0 && cleanup > save && thumbnail > save);
});

test('offers durable retry and confirmed delete recovery actions', () => {
  assert.match(cameraSource, /const retryFailedSave = useCallback/);
  assert.match(cameraSource, /await savePhotoToAlbum\(recovery\?\.uri \?\? review\.uri\)/);
  assert.match(cameraSource, /const deleteFailedCapture = useCallback/);
  assert.match(cameraSource, /Delete retained photo\?/);
  assert.match(cameraSource, /listCaptureRecoveries\(\)\[0\]/);
  assert.match(cameraSource, /captureBlockedByRecovery/);
  assert.match(reviewSource, /accessibilityLabel="Retry saving photo"/);
  assert.match(reviewSource, /accessibilityLabel="Delete retained photo"/);
  assert.match(reviewSource, /Saved to IntelliCam/);
  assert.match(reviewSource, /Photo not saved/);
});

test('never deletes an arbitrary path through the recovery service', () => {
  assert.match(recoverySource, /if \(!isRecoveryUri\(recovery\.uri\)\)/);
  assert.match(recoverySource, /Refusing to delete a file outside capture recovery storage/);
  assert.match(recoverySource, /if \(uri === retained \|\| isRecoveryUri\(uri\)\) continue/);
});
