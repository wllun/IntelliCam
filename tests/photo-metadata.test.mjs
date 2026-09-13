import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cameraSource = await readFile(
  new URL('../app/index.tsx', import.meta.url),
  'utf8',
);
const gallerySource = await readFile(
  new URL('../app/gallery.tsx', import.meta.url),
  'utf8',
);
const appConfig = JSON.parse(await readFile(
  new URL('../app.json', import.meta.url),
  'utf8',
));
const moduleConfig = JSON.parse(await readFile(
  new URL('../modules/photo-metadata/expo-module.config.json', import.meta.url),
  'utf8',
));

test('embeds capture metadata before saving the processed JPEG', () => {
  const embedIndex = cameraSource.indexOf('await embedPhotoMetadata(');
  const saveIndex = cameraSource.indexOf('await savePhotoToAlbum(processedUri)');
  assert.ok(embedIndex >= 0);
  assert.ok(saveIndex > embedIndex);
});

test('keeps capture location private by default', () => {
  assert.match(cameraSource, /useState\(false\);\s*\n\s*const \[captureLocation/);
  assert.match(cameraSource, /requestForegroundPermissionsAsync\(\)/);
});

test('offers photo information from the gallery overflow menu', () => {
  assert.match(gallerySource, /accessibilityLabel="Photo information"/);
  assert.match(gallerySource, /getAssetInfoAsync\(asset/);
  assert.match(gallerySource, /Photo information<\/Text>/);
});

test('registers metadata support and media-location access for native builds', () => {
  assert.deepEqual(moduleConfig.platforms, ['apple', 'android']);
  assert.ok(appConfig.expo.android.permissions.includes('android.permission.ACCESS_MEDIA_LOCATION'));
  const mediaLibraryPlugin = appConfig.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-media-library',
  );
  assert.equal(mediaLibraryPlugin[1].isAccessMediaLocationEnabled, true);
});
