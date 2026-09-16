import type { MultiFrameMode } from '../modules/multi-frame-processor';

export interface MultiFrameCapturePlan {
  mode: MultiFrameMode;
  frameCount: number;
}

export function getMultiFrameCapturePlan(
  captureModeId: string,
): Readonly<MultiFrameCapturePlan> | undefined;

export function isMultiFrameCaptureMode(captureModeId: string): boolean;
