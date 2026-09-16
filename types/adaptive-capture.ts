export type ComputationalMode = 'star' | 'light-trail' | 'waterfall';
export type PhotoQuality = 'standard' | 'maximum';
export type CaptureFlashMode = 'off' | 'auto' | 'on';

export interface MultiFrameCapturePlan {
  mode: ComputationalMode;
  frameCount: number;
}

/** Plain data only: never persist Nitro camera objects in photo metadata. */
export interface CameraCapabilities {
  deviceId: string | null;
  platform: string;
  flash: boolean;
  photoHDR: boolean;
  lowLightBoost: boolean;
  distortionCorrection: boolean;
  virtualDeviceFusion: boolean;
  exposureBias: { supported: boolean; minimum: number; maximum: number };
  zoom: { minimum: number; maximum: number };
  processing: { multiFrame: boolean; portrait: boolean; sceneMeasurement: boolean };
}

export interface RequestedCaptureSettings {
  modeId: string;
  photoQuality: PhotoQuality;
  hdr: boolean;
  flashMode: CaptureFlashMode;
  shutterSound: boolean;
  portraitEffect: boolean;
  aspectRatio: string;
  timerSeconds: number;
  zoom: number;
  exposureCompensation: number;
  focusExposureLocked: boolean;
}

export interface ResolvedCaptureSettings extends RequestedCaptureSettings {
  processing: ComputationalMode | 'single';
  frameCount: number;
  jpegQuality: number;
}

export interface CaptureFallback {
  setting: 'hdr' | 'flashMode' | 'portraitEffect' | 'processing' | 'frameCount';
  requested: boolean | string | number;
  resolved: boolean | string | number;
  reason: string;
}

export interface SceneMeasurements {
  sampledAt: string | null;
  phase: 'unavailable' | 'captured-reference' | 'processed-burst';
  highlightClipping: {
    fraction: number | null;
    sampleCount: number;
    threshold: number;
    source: 'captured-jpeg' | 'unavailable';
  };
  stability: {
    status: 'unknown' | 'steady' | 'moving' | 'unstable';
    displacementFraction: number | null;
    residualMotionFraction: number | null;
    rejectedFrameFraction: number | null;
    registeredFrameCount: number;
    source: 'frame-registration' | 'unavailable';
  };
}

export interface FrameSceneMeasurement {
  width: number;
  height: number;
  highlightClippingFraction: number;
  highlightSampleCount: number;
  highlightThreshold: number;
}

export interface FrameRegistration {
  index: number;
  offsetX: number;
  offsetY: number;
  motionScore: number;
  accepted: boolean;
  registrationSucceeded?: boolean;
}

export interface NativeSettingsSnapshot {
  sampledAt: string;
  source: 'controller-at-shutter';
  zoom: number | null;
  exposureBias: number | null;
  exposureBiasUnit: 'native-index' | 'ev';
  lowLightBoost: boolean | null;
  distortionCorrection: boolean | null;
  focusMode: string | null;
  exposureMode: string | null;
}

export interface CapturePlan {
  version: 1;
  capabilities: CameraCapabilities;
  requested: RequestedCaptureSettings;
  resolved: ResolvedCaptureSettings;
  /** Only confirmed session/capture/processor outcomes, not preset guidance. */
  applied: {
    hdr: boolean;
    frameCount: number;
    processing: ComputationalMode | 'single';
    portraitEffect: boolean;
    native: NativeSettingsSnapshot | null;
  };
  fallbacks: CaptureFallback[];
  scene: SceneMeasurements;
}
