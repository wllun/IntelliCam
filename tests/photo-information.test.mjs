import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../services/photo-metadata.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const asset = { filename: 'photo.jpg', uri: 'file:///photo.jpg', creationTime: 1000,
  width: 4000, height: 3000, mediaType: 'photo' };

async function information(embedded = {}, assetInfo = {}, available = true) {
  const exports = {};
  vm.runInNewContext(outputText, { exports, console: { warn() {} }, require(name) {
    assert.equal(name, '@/modules/photo-metadata');
    return { __esModule: true, default: available ? { readMetadataAsync: async () => {
      if (embedded instanceof Error) throw embedded;
      return embedded;
    } } : null };
  } });
  const sections = await exports.getPhotoInformation(asset, assetInfo);
  return Object.fromEntries(sections.flatMap((section) => section.rows.map(({ label, value }) => [label, value])));
}

test('older partial photo metadata does not crash or invent missing camera settings', async () => {
  const info = await information({ customMetadata: JSON.stringify({ schemaVersion: 1, captureMode: 'Auto' }) });
  assert.equal(info['Capture mode'], 'Auto');
  assert.equal(info.Dimensions, '4000 × 3000');
  for (const label of ['Zoom', 'Exposure compensation', 'Facing', 'Flash', 'HDR', 'Timer', 'Focus / exposure lock']) {
    assert.equal(info[label], undefined, label);
  }
});

test('malformed numeric, string and array fields are ignored safely', async () => {
  const info = await information({ customMetadata: JSON.stringify({ schemaVersion: 1,
    zoom: '2', exposureCompensation: null, facing: null, flash: {}, processingOperations: 'invalid',
    manualExposureApplied: true, appliedExposureSeconds: '1', capturePlan: { version: 1 } }),
  latitude: null, longitude: '100', altitude: null, fNumber: 2.8, focalLength: {} });
  for (const label of ['Zoom', 'Exposure compensation', 'Facing', 'Flash', 'Processing', 'Manual exposure', 'Coordinates', 'Altitude', 'Focal length']) {
    assert.equal(info[label], undefined, label);
  }
  assert.equal(info.Aperture, 'ƒ/2.8');
  assert.equal(info['Highlight clipping'], 'Unknown');
  const nonFinite = await information({ latitude: NaN, longitude: Infinity, altitude: Infinity });
  assert.equal(nonFinite.Coordinates, undefined);
  assert.equal(nonFinite.Altitude, undefined);
});

test('valid photo metadata retains formatting including zero exposure and coordinates', async () => {
  const info = await information({ customMetadata: JSON.stringify({ schemaVersion: 1,
    zoom: 2, exposureCompensation: 0, facing: 'back', flash: 'off', hdr: false,
    timerSeconds: 0, focusExposureLocked: true, processingOperations: ['HDR', 'Denoise'],
    manualExposureApplied: true, appliedExposureSeconds: 1.5, appliedIso: 200 }),
  latitude: 0, longitude: 0, altitude: -1, fNumber: '28/10', focalLength: '45/10', exposureTime: '1/125' });
  assert.equal(info.Zoom, '2.0×');
  assert.equal(info['Exposure compensation'], '+0.0 EV');
  assert.equal(info.Facing, 'Back');
  assert.equal(info.Flash, 'Off');
  assert.equal(info.HDR, 'Off');
  assert.equal(info.Timer, 'Off');
  assert.equal(info['Focus / exposure lock'], 'Locked');
  assert.equal(info.Processing, 'HDR, Denoise');
  assert.equal(info['Manual exposure'], '1.5 s at ISO 200');
  assert.equal(info.Coordinates, '0.000000, 0.000000');
  assert.equal(info.Altitude, '-1.0 m');
  assert.equal(info.Aperture, 'ƒ/2.8');
  assert.equal(info['Focal length'], '4.5 mm');
  assert.equal(info.Shutter, '1/125 s');
});

test('unavailable, empty or failed native metadata still permits library EXIF information', async () => {
  const assetInfo = { exif: { Make: 'Camera', ExposureTime: '1/60',
    UserComment: JSON.stringify({ schemaVersion: 1, zoom: 1 }) } };
  for (const [embedded, available] of [[{}, false], [null, true], [new Error('read failed'), true]]) {
    const info = await information(embedded, assetInfo, available);
    assert.equal(info.Zoom, '1.0×');
    assert.equal(info.Device, 'Camera');
    assert.equal(info.Shutter, '1/60 s');
  }
  for (const customMetadata of ['invalid json', '{"schemaVersion":2}', 'null']) {
    assert.equal((await information({ customMetadata })).File, 'photo.jpg');
  }
});
