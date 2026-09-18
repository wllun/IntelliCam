export const CAMERA_ASPECT_RATIOS = Object.freeze(['4:3', '1:1', '16:9', 'Full']);
export const CAMERA_TIMER_SECONDS = Object.freeze([0, 3, 5, 10, 30]);

export const DEFAULT_CAMERA_PREFERENCES = Object.freeze({
  gridLines: false,
  aspectRatio: '4:3',
  timerSeconds: 0,
  shutterSoundEnabled: false,
  hdrEnabled: false,
});

const aspectRatios = new Set(CAMERA_ASPECT_RATIOS);
const timerSeconds = new Set(CAMERA_TIMER_SECONDS);

export function normalizeCameraPreferences(value) {
  const preferences = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};

  return {
    gridLines: typeof preferences.gridLines === 'boolean'
      ? preferences.gridLines
      : DEFAULT_CAMERA_PREFERENCES.gridLines,
    aspectRatio: aspectRatios.has(preferences.aspectRatio)
      ? preferences.aspectRatio
      : DEFAULT_CAMERA_PREFERENCES.aspectRatio,
    timerSeconds: timerSeconds.has(preferences.timerSeconds)
      ? preferences.timerSeconds
      : DEFAULT_CAMERA_PREFERENCES.timerSeconds,
    shutterSoundEnabled: typeof preferences.shutterSoundEnabled === 'boolean'
      ? preferences.shutterSoundEnabled
      : DEFAULT_CAMERA_PREFERENCES.shutterSoundEnabled,
    hdrEnabled: typeof preferences.hdrEnabled === 'boolean'
      ? preferences.hdrEnabled
      : DEFAULT_CAMERA_PREFERENCES.hdrEnabled,
  };
}
