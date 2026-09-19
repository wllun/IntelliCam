export interface CaptureLifecycleIdentity {
  sessionId: number;
  cameraDeviceId: string | undefined;
}

export interface CaptureLifecycleState extends CaptureLifecycleIdentity {
  appActive: boolean;
  screenFocused: boolean;
  cameraReady: boolean;
}

export function isCaptureLifecycleCurrent(
  expected: CaptureLifecycleIdentity,
  current: CaptureLifecycleState,
): boolean;
