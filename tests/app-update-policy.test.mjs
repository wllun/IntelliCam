import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APP_UPDATE_CACHE_MAX_AGE_MS,
  evaluateAppUpdate,
  extractPlatformConfig,
  normalizeAppUpdateConfig,
  parseBuildVersion,
} from '../utils/app-update-policy.mjs';

const config = {
  platform: 'android',
  latestVersionCode: 5,
  minimumVersionCode: 4,
  forceUpdateEnabled: true,
  updateUrl: 'https://github.com/wllun/IntelliCam/releases/latest',
  message: 'Install the latest IntelliCam release.',
};

test('parses only positive integer native build versions', () => {
  assert.equal(parseBuildVersion('42'), 42);
  assert.equal(parseBuildVersion(7), 7);
  assert.equal(parseBuildVersion('2.1'), null);
  assert.equal(parseBuildVersion('2beta'), null);
  assert.equal(parseBuildVersion(0), null);
});

test('extracts the selected platform from the hosted policy document', () => {
  assert.deepEqual(
    extractPlatformConfig({ android: config }, 'android'),
    config,
  );
  assert.equal(extractPlatformConfig({ android: config }, 'ios'), null);
});

test('requires an update when an enabled minimum exceeds the installed build', () => {
  const result = evaluateAppUpdate({ currentBuildVersion: '3', config });
  assert.equal(result.required, true);
  assert.equal(result.updateAvailable, true);
  assert.equal(result.minimumVersionCode, 4);
  assert.equal(result.reason, 'below-minimum');
});

test('keeps the update optional while the remote switch is off', () => {
  const result = evaluateAppUpdate({
    currentBuildVersion: 3,
    config: { ...config, forceUpdateEnabled: false },
  });
  assert.equal(result.required, false);
  assert.equal(result.updateAvailable, true);
  assert.equal(result.reason, 'update-available');
});

test('honors a recent cached force policy but fails open when it becomes stale', () => {
  const now = Date.parse('2026-09-08T12:00:00.000Z');
  const recent = evaluateAppUpdate({
    currentBuildVersion: 3,
    config,
    source: 'cache',
    fetchedAt: new Date(now - APP_UPDATE_CACHE_MAX_AGE_MS + 1000).toISOString(),
    now,
  });
  assert.equal(recent.required, true);

  const stale = evaluateAppUpdate({
    currentBuildVersion: 3,
    config,
    source: 'cache',
    fetchedAt: new Date(now - APP_UPDATE_CACHE_MAX_AGE_MS - 1).toISOString(),
    now,
  });
  assert.equal(stale.required, false);
  assert.equal(stale.reason, 'stale-cache');
});

test('rejects unsafe links and inconsistent versions', () => {
  assert.equal(normalizeAppUpdateConfig({
    ...config,
    updateUrl: 'http://example.com/intellicam.apk',
  }), null);
  assert.equal(normalizeAppUpdateConfig({
    ...config,
    latestVersionCode: 3,
    minimumVersionCode: 4,
  }), null);
  assert.equal(normalizeAppUpdateConfig({
    ...config,
    platform: 'ios',
    updateUrl: 'market://details?id=com.wltechfreelance.IntelliCam',
  }), null);
});
