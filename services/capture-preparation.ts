import {
  CommonResolutions,
  type CameraDevice,
  type CameraController,
  type CapturePhotoSettings,
  type PhotoOutputOptions,
} from 'react-native-vision-camera';

import type { CameraCapabilities, CaptureFlashMode, NativeSettingsSnapshot, PhotoQuality } from '@/types/adaptive-capture';

export function readNativeCaptureSettings(
  controller: CameraController | undefined,
  platform: string,
): NativeSettingsSnapshot | null {
  if (!controller) return null;
  const read = <T,>(getter: () => T): T | null => {
    try { return getter(); } catch { return null; }
  };
  const number = (getter: () => number) => {
    const value = read(getter);
    return value !== null && Number.isFinite(value) ? value : null;
  };
  return {
    sampledAt: new Date().toISOString(),
    source: 'controller-at-shutter',
    zoom: number(() => controller.zoom),
    exposureBias: number(() => controller.exposureBias),
    exposureBiasUnit: platform === 'android' ? 'native-index' : 'ev',
    lowLightBoost: read(() => controller.isLowLightBoostEnabled),
    distortionCorrection: read(() => controller.isDistortionCorrectionEnabled),
    focusMode: read(() => controller.focusMode),
    exposureMode: read(() => controller.exposureMode),
    exposureSeconds: platform === 'ios' ? number(() => controller.exposureDuration) : null,
    iso: platform === 'ios' ? number(() => controller.iso) : null,
    whiteBalanceMode: read(() => controller.whiteBalanceMode),
  };
}

export function readCameraCapabilities(
  device: CameraDevice | undefined,
  platform: string,
  processing: CameraCapabilities['processing'],
): CameraCapabilities {
  return {
    deviceId: device?.id ?? null,
    platform,
    flash: device?.hasFlash ?? false,
    photoHDR: device?.supportsPhotoHDR ?? false,
    lowLightBoost: device?.supportsLowLightBoost ?? false,
    distortionCorrection: platform === 'ios' && (device?.supportsDistortionCorrection ?? false),
    virtualDeviceFusion: device?.isVirtualDevice ?? false,
    exposureBias: {
      supported: device?.supportsExposureBias ?? false,
      minimum: device?.minExposureBias ?? 0,
      maximum: device?.maxExposureBias ?? 0,
    },
    zoom: { minimum: device?.minZoom ?? 1, maximum: device?.maxZoom ?? 1 },
    processing,
  };
}

export function getPhotoOutputOptions(
  photoQuality: PhotoQuality,
  hdr: boolean,
  preferResponsiveCapture = false,
): PhotoOutputOptions {
  const maximumPhotoQuality = photoQuality === 'maximum';
  return {
    targetResolution: maximumPhotoQuality ? CommonResolutions.HIGHEST_4_3 : CommonResolutions.UHD_4_3,
    containerFormat: 'jpeg',
    quality: hdr || maximumPhotoQuality ? 1 : 0.92,
    // Balanced maps to CameraX MINIMIZE_LATENCY, not the unstable ZSL mode.
    // Keep maximum-quality priority for HDR and computational captures.
    qualityPrioritization: preferResponsiveCapture && !hdr
      ? 'balanced'
      : hdr || maximumPhotoQuality ? 'quality' : 'balanced',
  };
}

export function getPhotoCaptureSettings(
  capabilities: CameraCapabilities,
  photoQuality: PhotoQuality,
  hdr: boolean,
  flashMode: CaptureFlashMode,
  shutterSound: boolean,
  frameIndex = 0,
): CapturePhotoSettings {
  const enhancements = hdr || photoQuality === 'maximum';
  return {
    flashMode: capabilities.flash ? flashMode : 'off',
    enableShutterSound: shutterSound && frameIndex === 0,
    enableRedEyeReduction: enhancements,
    enableDistortionCorrection: enhancements && capabilities.distortionCorrection,
    enableVirtualDeviceFusion: enhancements && capabilities.virtualDeviceFusion,
  };
}
