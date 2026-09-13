import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gallerySource = await readFile(
  new URL('../app/gallery.tsx', import.meta.url),
  'utf8',
);

test('requests newest-first creation dates from Media Library', () => {
  assert.match(
    gallerySource,
    /\[MediaLibrary\.SortBy\.creationTime, false\]/,
  );
});

test('reapplies newest-first ordering after initial load and pagination', () => {
  assert.match(gallerySource, /setAssets\(sortPhotosNewestFirst\(page\.assets\)\)/);
  assert.match(
    gallerySource,
    /return sortPhotosNewestFirst\(\[\s*\.\.\.current,[\s\S]*?\.\.\.page\.assets/,
  );
  assert.match(
    gallerySource,
    /const creationDifference = second\.creationTime - first\.creationTime/,
  );
});
