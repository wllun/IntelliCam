import type { MultiFrameCapturePlan } from '../types/adaptive-capture';
export type { MultiFrameCapturePlan } from '../types/adaptive-capture';

export function getMultiFrameCapturePlan(
  captureModeId: string,
): Readonly<MultiFrameCapturePlan> | undefined;

export function isMultiFrameCaptureMode(captureModeId: string): boolean;
