export const APP_UPDATE_CACHE_MAX_AGE_MS = 72 * 60 * 60 * 1000;
export const DEFAULT_APP_UPDATE_MESSAGE =
  'A newer version of IntelliCam is required to continue.';

const SUPPORTED_PLATFORMS = new Set(['android', 'ios']);

export const parseBuildVersion = (value) => {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;

  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizeUpdateUrl = (value, platform) => {
  if (typeof value !== 'string') return null;

  const url = value.trim();
  const isHttps = /^https:\/\/[^\s]+$/i.test(url);
  const isAndroidMarket = platform === 'android' && /^market:\/\/[^\s]+$/i.test(url);
  return isHttps || isAndroidMarket ? url : null;
};

export const extractPlatformConfig = (document, platform) => {
  if (!document || typeof document !== 'object' || !SUPPORTED_PLATFORMS.has(platform)) {
    return null;
  }

  if (document.platform === platform) return document;
  const config = document[platform];
  return config && typeof config === 'object'
    ? { ...config, platform }
    : null;
};

export const normalizeAppUpdateConfig = (value) => {
  if (!value || !SUPPORTED_PLATFORMS.has(value.platform)) return null;

  const latestVersionCode = parseBuildVersion(value.latestVersionCode);
  const minimumVersionCode = parseBuildVersion(value.minimumVersionCode);
  const updateUrl = normalizeUpdateUrl(value.updateUrl, value.platform);
  if (
    !latestVersionCode
    || !minimumVersionCode
    || latestVersionCode < minimumVersionCode
    || !updateUrl
  ) {
    return null;
  }

  const message = typeof value.message === 'string'
    ? value.message.trim().slice(0, 500)
    : '';

  return {
    platform: value.platform,
    latestVersionCode,
    minimumVersionCode,
    forceUpdateEnabled: value.forceUpdateEnabled === true,
    updateUrl,
    message: message || DEFAULT_APP_UPDATE_MESSAGE,
  };
};

export const evaluateAppUpdate = ({
  currentBuildVersion,
  config,
  source = 'remote',
  fetchedAt = null,
  now = Date.now(),
  maxCacheAgeMs = APP_UPDATE_CACHE_MAX_AGE_MS,
} = {}) => {
  const currentBuild = parseBuildVersion(currentBuildVersion);
  const normalized = normalizeAppUpdateConfig(config);
  if (!currentBuild || !normalized) {
    return {
      checked: true,
      supported: false,
      required: false,
      updateAvailable: false,
      reason: 'invalid-config',
    };
  }

  if (source === 'cache') {
    const cachedAt = Date.parse(fetchedAt ?? '');
    const cacheAge = now - cachedAt;
    if (!Number.isFinite(cachedAt) || cacheAge < 0 || cacheAge > maxCacheAgeMs) {
      return {
        checked: true,
        supported: true,
        required: false,
        updateAvailable: false,
        reason: 'stale-cache',
        source,
        currentBuildVersion: currentBuild,
      };
    }
  }

  const updateAvailable = currentBuild < normalized.latestVersionCode;
  const required = normalized.forceUpdateEnabled
    && currentBuild < normalized.minimumVersionCode;

  return {
    checked: true,
    supported: true,
    required,
    updateAvailable,
    reason: required ? 'below-minimum' : updateAvailable ? 'update-available' : 'current',
    source,
    platform: normalized.platform,
    currentBuildVersion: currentBuild,
    latestVersionCode: normalized.latestVersionCode,
    minimumVersionCode: normalized.minimumVersionCode,
    updateUrl: normalized.updateUrl,
    message: normalized.message,
  };
};
