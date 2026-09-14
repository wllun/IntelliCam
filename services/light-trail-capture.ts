export type LightTrailCaptureStrategy =
  | 'manual-long-exposure'
  | 'automatic-lighten-composite'
  | 'automatic-low-light';

export interface LightTrailCaptureCapabilities {
  platform: 'ios' | 'android' | 'web';
  supportsManualExposure: boolean;
  supportsManualWhiteBalance: boolean;
  supportsLightenCompositing: boolean;
  exposureSecondsRange?: { min: number; max: number };
  isoRange?: { min: number; max: number };
}

export interface LightTrailCapturePlan {
  strategy: LightTrailCaptureStrategy;
  frameCount: number;
  exposureSeconds?: number;
  iso?: number;
  whiteBalanceKelvin?: number;
  guidance: string;
  fallbackReason?: string;
}

const IDEAL_EXPOSURE_SECONDS = 4;
const IDEAL_ISO = 100;
const WHITE_BALANCE_KELVIN = 5000;
export const LIGHT_TRAIL_FRAME_COUNT = 8;
export const LIGHT_TRAIL_FRAME_INTERVAL_MS = 500;

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

/** Resolve a Light Trail plan that the active camera can really execute. */
export function resolveLightTrailCapturePlan(
  capabilities: LightTrailCaptureCapabilities,
): LightTrailCapturePlan {
  const canUseManualExposure = capabilities.platform === 'ios'
    && capabilities.supportsManualExposure
    && validRange(capabilities.exposureSecondsRange)
    && validRange(capabilities.isoRange);

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
      strategy: 'manual-long-exposure',
      frameCount: 1,
      exposureSeconds,
      iso,
      whiteBalanceKelvin: capabilities.supportsManualWhiteBalance
        ? WHITE_BALANCE_KELVIN
        : undefined,
      guidance: 'Use a tripod and keep the phone still until the exposure finishes.',
    };
  }

  if (capabilities.supportsLightenCompositing) {
    return {
      strategy: 'automatic-lighten-composite',
      frameCount: LIGHT_TRAIL_FRAME_COUNT,
      guidance: 'Use a tripod and keep the phone still while all eight frames are captured.',
      fallbackReason: 'Manual shutter and ISO are unavailable on this camera; combining bright areas from timed frames.',
    };
  }

  return {
    strategy: 'automatic-low-light',
    frameCount: 1,
    guidance: 'Brace the phone or use a tripod for the clearest result.',
    fallbackReason: 'This installed build does not include the Light Trail compositor.',
  };
}

export function getLightTrailPlanLabel(plan: LightTrailCapturePlan) {
  switch (plan.strategy) {
    case 'manual-long-exposure':
      return 'Long exposure';
    case 'automatic-lighten-composite':
      return `${plan.frameCount}-frame trail`; 
    default:
      return 'Native low light';
  }
}
