export type WaterfallCaptureStrategy =
  | 'manual-slow-exposure'
  | 'automatic-temporal-average'
  | 'automatic-low-light';

export interface WaterfallCaptureCapabilities {
  platform: 'ios' | 'android' | 'web';
  supportsManualExposure: boolean;
  supportsManualWhiteBalance: boolean;
  supportsTemporalAveraging: boolean;
  exposureSecondsRange?: { min: number; max: number };
  isoRange?: { min: number; max: number };
}

export interface WaterfallCapturePlan {
  strategy: WaterfallCaptureStrategy;
  frameCount: number;
  exposureSeconds?: number;
  iso?: number;
  whiteBalanceKelvin?: number;
  guidance: string;
  fallbackReason?: string;
}

const IDEAL_EXPOSURE_SECONDS = 1;
const MINIMUM_USEFUL_EXPOSURE_SECONDS = 0.25;
const IDEAL_ISO = 50;
const WHITE_BALANCE_KELVIN = 5500;
export const WATERFALL_FRAME_COUNT = 8;
export const WATERFALL_FRAME_INTERVAL_MS = 180;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function validRange(range: { min: number; max: number } | undefined) {
  return Boolean(
    range
    && Number.isFinite(range.min)
    && Number.isFinite(range.max)
    && range.min > 0
    && range.max >= range.min,
  );
}

/** Resolve a Waterfall plan that the active camera can actually execute. */
export function resolveWaterfallCapturePlan(
  capabilities: WaterfallCaptureCapabilities,
): WaterfallCapturePlan {
  const canUseManualExposure = capabilities.platform === 'ios'
    && capabilities.supportsManualExposure
    && validRange(capabilities.exposureSecondsRange)
    && validRange(capabilities.isoRange)
    && capabilities.exposureSecondsRange!.max >= MINIMUM_USEFUL_EXPOSURE_SECONDS;

  if (canUseManualExposure) {
    const exposureRange = capabilities.exposureSecondsRange!;
    const isoRange = capabilities.isoRange!;
    const exposureSeconds = clamp(
      IDEAL_EXPOSURE_SECONDS,
      exposureRange.min,
      exposureRange.max,
    );
    const durationAdjustedIso = IDEAL_ISO * (IDEAL_EXPOSURE_SECONDS / exposureSeconds);
    const iso = Math.round(clamp(durationAdjustedIso, isoRange.min, isoRange.max));

    return {
      strategy: 'manual-slow-exposure',
      frameCount: 1,
      exposureSeconds,
      iso,
      whiteBalanceKelvin: capabilities.supportsManualWhiteBalance
        ? WHITE_BALANCE_KELVIN
        : undefined,
      guidance: 'Use a tripod and keep the phone still until the exposure finishes.',
    };
  }

  if (capabilities.supportsTemporalAveraging) {
    return {
      strategy: 'automatic-temporal-average',
      frameCount: WATERFALL_FRAME_COUNT,
      guidance: 'Use a tripod and keep the phone still while all eight frames are captured.',
      fallbackReason: 'A useful manual shutter duration is unavailable; averaging timed frames to smooth the water.',
    };
  }

  return {
    strategy: 'automatic-low-light',
    frameCount: 1,
    guidance: 'Brace the phone or use a tripod for the clearest result.',
    fallbackReason: 'This installed build does not include the temporal averaging processor.',
  };
}

export function getWaterfallPlanLabel(plan: WaterfallCapturePlan) {
  switch (plan.strategy) {
    case 'manual-slow-exposure':
      return 'Slow exposure';
    case 'automatic-temporal-average':
      return `${plan.frameCount}-frame smoothing`;
    default:
      return 'Native low light';
  }
}
