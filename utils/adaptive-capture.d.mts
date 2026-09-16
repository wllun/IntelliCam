import type {
  CameraCapabilities, CapturePlan, FrameRegistration, FrameSceneMeasurement,
  RequestedCaptureSettings, SceneMeasurements,
} from '../types/adaptive-capture';

export function emptySceneMeasurements(): SceneMeasurements;
export function resolveCapturePlan(
  capabilities: CameraCapabilities,
  requested: RequestedCaptureSettings,
  scene?: SceneMeasurements,
): CapturePlan;
export function measureCapturedScene(
  measurement?: FrameSceneMeasurement,
  alignments?: FrameRegistration[],
  sampledAt?: string,
): SceneMeasurements;
export interface CaptureOutcome {
  hdrConfirmed: boolean;
  acceptedFrameCount: number;
  multiFrameApplied: boolean;
  multiFrameFailureReason?: string;
  portraitApplied: boolean;
  portraitFailureReason?: string;
  scene?: SceneMeasurements;
}
export function finalizeCapturePlan(plan: CapturePlan, outcome: CaptureOutcome): CapturePlan;
