import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Linking from 'expo-linking';

import {
  evaluateAppUpdate,
  extractPlatformConfig,
  normalizeAppUpdateConfig,
} from '@/utils/app-update-policy.mjs';

const CACHE_KEY_PREFIX = '@intellicam_app_update_config_v1';
const REQUEST_TIMEOUT_MS = 5000;
const DEFAULT_CONFIG_URL =
  'https://raw.githubusercontent.com/wllun/IntelliCam/main/app-update.json';
const CONFIG_URL = process.env.EXPO_PUBLIC_APP_UPDATE_CONFIG_URL?.trim()
  || DEFAULT_CONFIG_URL;
const PLAY_PACKAGE = 'com.wltechfreelance.IntelliCam';
const PLAY_MARKET_URL = `market://details?id=${PLAY_PACKAGE}`;
const PLAY_WEB_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`;

export interface AppUpdateResult {
  checked: boolean;
  supported: boolean;
  required: boolean;
  updateAvailable: boolean;
  reason: string;
  source?: string;
  platform?: 'android' | 'ios';
  currentBuildVersion?: number;
  latestVersionCode?: number;
  minimumVersionCode?: number;
  updateUrl?: string;
  message?: string;
}

interface CachedConfig {
  config: unknown;
  fetchedAt: string;
}

type CheckContext =
  | { result: AppUpdateResult }
  | { platform: 'android' | 'ios'; currentBuildVersion: string };

const unsupportedResult = (reason: string): AppUpdateResult => ({
  checked: true,
  supported: false,
  required: false,
  updateAvailable: false,
  reason,
});

const getNativePlatform = (): 'android' | 'ios' | null => {
  const platform = process.env.EXPO_OS;
  return platform === 'android' || platform === 'ios' ? platform : null;
};

const getCacheKey = (platform: 'android' | 'ios') => `${CACHE_KEY_PREFIX}_${platform}`;

const readCache = async (platform: 'android' | 'ios'): Promise<CachedConfig | null> => {
  try {
    const raw = await AsyncStorage.getItem(getCacheKey(platform));
    if (!raw) return null;

    const value = JSON.parse(raw) as Partial<CachedConfig>;
    return value.config && typeof value.fetchedAt === 'string'
      ? { config: value.config, fetchedAt: value.fetchedAt }
      : null;
  } catch {
    return null;
  }
};

const saveCache = async (
  platform: 'android' | 'ios',
  config: unknown,
  fetchedAt: string,
) => {
  await AsyncStorage.setItem(
    getCacheKey(platform),
    JSON.stringify({ config, fetchedAt }),
  );
};

const fetchRemoteConfig = async (platform: 'android' | 'ios') => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(CONFIG_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Update policy returned HTTP ${response.status}.`);
    }

    const document: unknown = await response.json();
    const config = extractPlatformConfig(document, platform);
    if (!normalizeAppUpdateConfig(config)) {
      throw new Error(`The ${platform} update policy is invalid.`);
    }
    return config;
  } finally {
    clearTimeout(timeout);
  }
};

const evaluateCachedConfig = async (
  platform: 'android' | 'ios',
  currentBuildVersion: string,
): Promise<AppUpdateResult> => {
  const cached = await readCache(platform);
  if (!cached) return unsupportedResult('unavailable');

  const normalized = normalizeAppUpdateConfig(cached.config);
  if (normalized?.platform !== platform) return unsupportedResult('invalid-cache');

  return evaluateAppUpdate({
    currentBuildVersion,
    config: cached.config,
    source: 'cache',
    fetchedAt: cached.fetchedAt,
  });
};

const getCheckContext = (): CheckContext => {
  const platform = getNativePlatform();
  if (!platform) return { result: unsupportedResult('unsupported-platform') };
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return { result: unsupportedResult('expo-go') };
  }

  const currentBuildVersion = Application.nativeBuildVersion;
  if (!currentBuildVersion) return { result: unsupportedResult('unknown-build') };
  return { platform, currentBuildVersion };
};

export const checkCachedAppUpdate = async (): Promise<AppUpdateResult> => {
  const context = getCheckContext();
  if ('result' in context) return context.result;
  return evaluateCachedConfig(context.platform, context.currentBuildVersion);
};

export const checkForAppUpdate = async (): Promise<AppUpdateResult> => {
  const context = getCheckContext();
  if ('result' in context) return context.result;

  try {
    const config = await fetchRemoteConfig(context.platform);
    const fetchedAt = new Date().toISOString();
    const result = evaluateAppUpdate({
      currentBuildVersion: context.currentBuildVersion,
      config,
    }) as AppUpdateResult;
    await saveCache(context.platform, config, fetchedAt).catch(() => {});
    return result;
  } catch {
    console.warn('App update check failed; using a recent cached policy if available.');
    return evaluateCachedConfig(context.platform, context.currentBuildVersion);
  }
};

export const openAppUpdatePage = async (configuredUrl?: string) => {
  const platformFallbacks = getNativePlatform() === 'android'
    ? [PLAY_MARKET_URL, PLAY_WEB_URL]
    : [];
  const urls = [configuredUrl, ...platformFallbacks]
    .filter((url, index, values): url is string => (
      typeof url === 'string' && !!url && values.indexOf(url) === index
    ));

  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {}
  }
  return false;
};
