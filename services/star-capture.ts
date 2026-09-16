export type StarCaptureStrategy =
  | 'manual-long-exposure'
  | 'automatic-frame-stack'
  | 'automatic-low-light';

export interface StarCaptureCapabilities {
  platform: 'ios' | 'android' | 'web';
  supportsManualExposure: boolean;
  supportsManualFocus: boolean;
  supportsManualWhiteBalance: boolean;
  supportsFrameStacking: boolean;
  exposureSecondsRange?: { min: number; max: number };
  isoRange?: { min: number; max: number };
}

export interface StarCapturePlan {
  strategy: StarCaptureStrategy;
  frameCount: number;
  exposureSeconds?: number;
  iso?: number;
  whiteBalanceKelvin?: number;
  lockFocusAtInfinity: boolean;
  guidance: string;
  fallbackReason?: string;
}

const STAR_IDEAL_EXPOSURE_SECONDS = 15;
const STAR_IDEAL_ISO_AT_FIFTEEN_SECONDS = 800;
const STAR_WHITE_BALANCE_KELVIN = 4000;
export const STAR_STACK_FRAME_COUNT = 4;

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

/**
 * Resolves an executable Star plan from capabilities reported by the active
 * camera. The plan never advertises manual values on a backend that cannot
 * actually apply them.
 */
export function resolveStarCapturePlan(
  capabilities: StarCaptureCapabilities,
): StarCapturePlan {
  const canUseManualExposure = capabilities.platform === 'ios'
    && capabilities.supportsManualExposure
    && validRange(capabilities.exposureSecondsRange)
    && validRange(capabilities.isoRange);

  if (canUseManualExposure) {
    const exposureRange = capabilities.exposureSecondsRange!;
    const isoRange = capabilities.isoRange!;
    const exposureSeconds = clamp(
      STAR_IDEAL_EXPOSURE_SECONDS,
      exposureRange.min,
      exposureRange.max,
    );
    // Compensate for a device whose maximum shutter duration is shorter than
    // the preferred 15 seconds, while still respecting its real ISO range.
    const durationAdjustedIso = STAR_IDEAL_ISO_AT_FIFTEEN_SECONDS
      * (STAR_IDEAL_EXPOSURE_SECONDS / exposureSeconds);
    const iso = Math.round(clamp(durationAdjustedIso, isoRange.min, isoRange.max));

    return {
      strategy: 'manual-long-exposure',
      frameCount: 1,
      exposureSeconds,
      iso,
      whiteBalanceKelvin: capabilities.supportsManualWhiteBalance
        ? STAR_WHITE_BALANCE_KELVIN
        : undefined,
      lockFocusAtInfinity: capabilities.supportsManualFocus,
      guidance: 'Keep the phone completely still until the exposure finishes.',
    };
  }

  if (capabilities.supportsFrameStacking) {
    return {
      strategy: 'automatic-frame-stack',
      frameCount: STAR_STACK_FRAME_COUNT,
      lockFocusAtInfinity: false,
      guidance: 'Brace the phone or use a tripod until all four frames finish.',
      fallbackReason: 'Manual shutter and ISO are unavailable on this camera; using a low-noise frame stack.',
    };
  }

  return {
    strategy: 'automatic-low-light',
    frameCount: 1,
    lockFocusAtInfinity: false,
    guidance: 'Brace the phone or use a tripod for the clearest result.',
    fallbackReason: 'This installed build does not include the Star frame-stacking processor.',
  };
}

export function getStarPlanLabel(plan: StarCapturePlan) {
  switch (plan.strategy) {
    case 'manual-long-exposure':
      return 'Long exposure';
    case 'automatic-frame-stack':
      return `${plan.frameCount}-frame stack`;
    default:
      return 'Native low light';
  }
}
