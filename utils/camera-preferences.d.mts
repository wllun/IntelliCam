export type CameraAspectRatio = '1:1' | '4:3' | '9:16' | 'Full';
export type CameraTimerSeconds = 0 | 3 | 5 | 10 | 30;

export interface CameraPreferences {
  gridLines: boolean;
  aspectRatio: CameraAspectRatio;
  timerSeconds: CameraTimerSeconds;
  shutterSoundEnabled: boolean;
  hdrEnabled: boolean;
}

export const CAMERA_ASPECT_RATIOS: readonly CameraAspectRatio[];
export const CAMERA_TIMER_SECONDS: readonly CameraTimerSeconds[];
export const DEFAULT_CAMERA_PREFERENCES: Readonly<CameraPreferences>;

export function normalizeCameraPreferences(value: unknown): CameraPreferences;
