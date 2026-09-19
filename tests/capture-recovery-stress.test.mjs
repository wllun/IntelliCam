import assert from 'node:assert/strict';
import test from 'node:test';

import { preserveOriginalForRecovery } from '../utils/capture-recovery-policy.mjs';

class FakeFile {
  constructor(storage, path, options = {}) {
    this.storage = storage;
    this.path = path;
    this.options = options;
    this.copyAttempts = 0;
  }

  get exists() {
    return this.storage.has(this.path);
  }

  move(destination) {
    if (this.options.failMove) throw new Error('move unavailable');
    if (!this.exists) throw new Error('source missing');
    destination.storage.set(destination.path, this.storage.get(this.path));
    this.storage.delete(this.path);
  }

  copy(destination) {
    this.copyAttempts += 1;
    if (this.options.failCopy) throw new Error('ENOSPC');
    if (!this.exists) throw new Error('source missing');
    destination.storage.set(destination.path, this.storage.get(this.path));
  }

  delete() {
    this.storage.delete(this.path);
  }
}

test('250 repeated captures transfer ownership immediately without losing bytes', () => {
  const storage = new Map();
  const gallery = new Map();
  const failedSaves = new Set();

  for (let captureId = 1; captureId <= 250; captureId += 1) {
    const payload = `jpeg-${captureId}`;
    const source = new FakeFile(storage, `/cache/${captureId}.jpg`, { failCopy: true });
    const recovery = new FakeFile(storage, `/documents/pending/${captureId}.jpg`);
    storage.set(source.path, payload);

    assert.equal(preserveOriginalForRecovery(source, recovery), 'moved');
    assert.equal(source.copyAttempts, 0, 'move-first retention must not duplicate a JPEG');
    assert.equal(storage.get(recovery.path), payload);

    // Simulate intermittent MediaLibrary ENOSPC failures. Successful captures
    // move into the gallery model; failed captures must remain recoverable.
    if (captureId % 4 === 0) {
      failedSaves.add(captureId);
    } else {
      gallery.set(captureId, storage.get(recovery.path));
      recovery.delete();
    }
  }

  assert.equal(gallery.size, 188);
  assert.equal(failedSaves.size, 62);
  for (let captureId = 1; captureId <= 250; captureId += 1) {
    const expected = `jpeg-${captureId}`;
    assert.equal(
      gallery.get(captureId) ?? storage.get(`/documents/pending/${captureId}.jpg`),
      expected,
    );
  }
});

test('low-storage copy failure still retains the original through a no-copy move', () => {
  const storage = new Map([['/cache/photo.jpg', 'original-jpeg']]);
  const source = new FakeFile(storage, '/cache/photo.jpg', { failCopy: true });
  const recovery = new FakeFile(storage, '/documents/pending/photo.jpg');

  assert.equal(preserveOriginalForRecovery(source, recovery), 'moved');
  assert.equal(source.copyAttempts, 0);
  assert.equal(storage.get(recovery.path), 'original-jpeg');
  assert.equal(source.exists, false);
});

test('cross-location move failure falls back to copying while preserving the source', () => {
  const storage = new Map([['/provider/photo.jpg', 'original-jpeg']]);
  const source = new FakeFile(storage, '/provider/photo.jpg', { failMove: true });
  const recovery = new FakeFile(storage, '/documents/pending/photo.jpg');

  assert.equal(preserveOriginalForRecovery(source, recovery), 'copied');
  assert.equal(storage.get(source.path), 'original-jpeg');
  assert.equal(storage.get(recovery.path), 'original-jpeg');
});

test('if both retention methods fail, the camera original is never deleted', () => {
  const storage = new Map([['/provider/photo.jpg', 'original-jpeg']]);
  const source = new FakeFile(storage, '/provider/photo.jpg', {
    failMove: true,
    failCopy: true,
  });
  const recovery = new FakeFile(storage, '/documents/pending/photo.jpg');

  assert.throws(
    () => preserveOriginalForRecovery(source, recovery),
    /Could not retain the captured photo/,
  );
  assert.equal(storage.get(source.path), 'original-jpeg');
  assert.equal(recovery.exists, false);
});
