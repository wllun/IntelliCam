import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const captureModesSource = await readFile(
  new URL('../constants/capture-modes.ts', import.meta.url),
  'utf8',
);
const cameraScreenSource = await readFile(
  new URL('../app/index.tsx', import.meta.url),
  'utf8',
);
const presetSource = await readFile(
  new URL('../constants/presets.ts', import.meta.url),
  'utf8',
);

test('shows Auto, Beauty and Product first while preserving the remaining preset order', () => {
  const evaluate = (source, require = () => { throw new Error('Unexpected import'); }) => {
    const exports = {};
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    runInNewContext(outputText, { exports, require });
    return exports;
  };
  const { PRESETS } = evaluate(presetSource);
  const originalPresetIds = Array.from(PRESETS, (preset) => preset.id);
  const { CAPTURE_MODES } = evaluate(captureModesSource, (id) => {
    if (id === '@/constants/presets') return { PRESETS };
    if (id.endsWith('.png')) return 0;
    throw new Error(`Unexpected import: ${id}`);
  });
  const expectedIds = ['auto', 'beauty', 'product',
    ...originalPresetIds.filter((id) => id !== 'beauty' && id !== 'product')];
  assert.deepEqual(Array.from(CAPTURE_MODES, (mode) => mode.id), expectedIds);
  assert.deepEqual(Array.from(PRESETS, (preset) => preset.id), originalPresetIds);
});

test('keeps Auto as the first and default capture mode', () => {
  assert.match(captureModesSource, /id:\s*['"]auto['"]/);
  assert.match(captureModesSource, /name:\s*['"]Auto['"]/);
  assert.match(
    captureModesSource,
    /CAPTURE_MODES[^=]*=\s*\[\s*AUTO_CAPTURE_MODE,/,
  );
  assert.match(
    cameraScreenSource,
    /useState\(DEFAULT_CAPTURE_MODE_ID\)/,
  );
});

test('uses one active mode id on the shared camera screen', () => {
  assert.match(cameraScreenSource, /selectedId=\{activeCaptureModeId\}/);
  assert.doesNotMatch(cameraScreenSource, /type CaptureMode = ['"]normal['"] \| ['"]preset['"]/);
});

test('omits standalone Portrait mode while retaining Auto Portrait effect', () => {
  assert.doesNotMatch(presetSource, /id:\s*['"]portrait['"]/);
  assert.match(presetSource, /id:\s*['"]beauty['"]/);
  assert.match(cameraScreenSource, /accessibilityLabel="Portrait effect"/);
});
