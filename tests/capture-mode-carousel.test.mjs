import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const carouselSource = await readFile(
  new URL('../components/capture-mode-carousel.tsx', import.meta.url),
  'utf8',
);

test('keeps the carousel clamp helper callable from the swipe worklet', () => {
  assert.match(
    carouselSource,
    /function clamp\([^)]*\)\s*\{\s*['"]worklet['"];?/,
  );
});
