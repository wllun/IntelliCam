export const APP_UPDATE_CACHE_MAX_AGE_MS: number;
export const DEFAULT_APP_UPDATE_MESSAGE: string;

export interface RawAppUpdateConfig {
  platform?: unknown;
  latestVersionCode?: unknown;
  minimumVersionCode?: unknown;
  forceUpdateEnabled?: unknown;
  updateUrl?: unknown;
  message?: unknown;
  [key: string]: unknown;
}

export interface NormalizedAppUpdateConfig {
  platform: 'android' | 'ios';
  latestVersionCode: number;
  minimumVersionCode: number;
  forceUpdateEnabled: boolean;
  updateUrl: string;
  message: string;
}

export interface AppUpdatePolicyResult {
  checked: true;
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

export function parseBuildVersion(value: unknown): number | null;

export function extractPlatformConfig(
  document: unknown,
  platform: string,
): RawAppUpdateConfig | null;

export function normalizeAppUpdateConfig(
  value: unknown,
): NormalizedAppUpdateConfig | null;

export function evaluateAppUpdate(options?: {
  currentBuildVersion?: unknown;
  config?: unknown;
  source?: string;
  fetchedAt?: string | null;
  now?: number;
  maxCacheAgeMs?: number;
}): AppUpdatePolicyResult;
