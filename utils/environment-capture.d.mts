import type { ComputationalMode, EnvironmentCaptureDecision, LiveCaptureScene } from '../types/adaptive-capture';
export function unavailableLiveScene(reason?: string): LiveCaptureScene;
export function resolveEnvironmentCapture(
  mode: ComputationalMode,
  base: { frameCount: number; exposureSeconds?: number; iso?: number; lockFocusAtInfinity?: boolean },
  scene: LiveCaptureScene | null,
  ranges?: { exposure?: { min: number; max: number }; iso?: { min: number; max: number } },
  now?: number,
): EnvironmentCaptureDecision;
