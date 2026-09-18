import type { CapturePhotoMetadata } from './photo-metadata';
import MultiFrameProcessor, { type MultiFrameProcessResult } from '@/modules/multi-frame-processor';
import type { CapturePlan, FrameRegistration, FrameSceneMeasurement, NativeSettingsSnapshot, SceneMeasurements } from '@/types/adaptive-capture';
import { emptySceneMeasurements, finalizeCapturePlan, measureCapturedScene } from '@/utils/adaptive-capture.mjs';

export interface CaptureMetadataContext {
  captureMode: string;
  facing: 'front' | 'back';
  cameraName?: string;
  cameraModel?: string;
  cameraType?: string;
  locationSaved: boolean;
  hdrConfirmed: boolean;
  nativeSettings: NativeSettingsSnapshot | null;
}

export function createCaptureMetadata(plan: CapturePlan, context: CaptureMetadataContext): CapturePhotoMetadata {
  const settings = plan.resolved;
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    captureMode: context.captureMode,
    captureModeId: settings.modeId,
    aspectRatio: settings.aspectRatio,
    zoom: settings.zoom,
    facing: context.facing,
    cameraName: context.cameraName,
    cameraModel: context.cameraModel,
    cameraType: context.cameraType,
    flash: settings.flashMode,
    hdr: settings.hdr && context.hdrConfirmed,
    photoQuality: settings.photoQuality,
    exposureCompensation: settings.exposureCompensation,
    focusExposureLocked: settings.focusExposureLocked,
    timerSeconds: settings.timerSeconds,
    locationSaved: context.locationSaved,
    capturePlan: { ...plan, applied: { ...plan.applied, native: context.nativeSettings } },
  };
}

export async function startCaptureSceneMeasurement(uri: string): Promise<FrameSceneMeasurement | null> {
  // Existing clients may have the processor but not this newly added method.
  if (typeof MultiFrameProcessor?.measureAsync !== 'function') return null;
  try {
    return await MultiFrameProcessor.measureAsync(uri);
  } catch (error) {
    console.warn('Scene measurement unavailable:', error);
    return null;
  }
}

export async function measureCaptureScene(
  uri: string,
  alignments?: FrameRegistration[],
  pendingMeasurement?: Promise<FrameSceneMeasurement | null>,
): Promise<SceneMeasurements> {
  const measurement = await (pendingMeasurement ?? startCaptureSceneMeasurement(uri));
  return measurement ? measureCapturedScene(measurement, alignments) : emptySceneMeasurements();
}

export function completeCaptureMetadata(
  metadata: CapturePhotoMetadata,
  sourceFrameCount: number,
  result: MultiFrameProcessResult | undefined,
  portraitApplied: boolean,
  scene: SceneMeasurements,
  multiFrameFailureReason?: string,
  portraitFailureReason?: string,
): CapturePhotoMetadata {
  const plan = metadata.capturePlan;
  const applied = result?.applied ?? false;
  const acceptedFrameCount = applied ? result?.acceptedFrameCount ?? 1 : 1;
  const completedPlan = plan && finalizeCapturePlan(plan, {
    hdrConfirmed: metadata.hdr,
    acceptedFrameCount,
    multiFrameApplied: applied,
    multiFrameFailureReason,
    portraitApplied,
    portraitFailureReason,
    scene,
  });
  return {
    ...metadata,
    capturePlan: completedPlan,
    portraitEffectRequested: plan?.requested.portraitEffect ?? false,
    portraitEffectApplied: completedPlan?.applied.portraitEffect ?? portraitApplied,
    multiFrameRequested: plan
      ? plan.resolved.processing !== 'single' || plan.fallbacks.some((item) => item.setting === 'processing')
      : false,
    multiFrameApplied: applied,
    inputFrameCount: sourceFrameCount,
    acceptedFrameCount,
    rejectedFrameCount: Math.max(0, sourceFrameCount - acceptedFrameCount),
  };
}
