import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_CAMERA_PREFERENCES,
  normalizeCameraPreferences,
  type CameraPreferences,
} from '@/utils/camera-preferences.mjs';

const CAMERA_PREFERENCES_KEY = '@intellicam_camera_preferences_v1';

export async function loadCameraPreferences(): Promise<CameraPreferences> {
  try {
    const storedPreferences = await AsyncStorage.getItem(CAMERA_PREFERENCES_KEY);
    if (!storedPreferences) return { ...DEFAULT_CAMERA_PREFERENCES };
    return normalizeCameraPreferences(JSON.parse(storedPreferences));
  } catch {
    return { ...DEFAULT_CAMERA_PREFERENCES };
  }
}

export async function saveCameraPreferences(preferences: CameraPreferences) {
  try {
    await AsyncStorage.setItem(
      CAMERA_PREFERENCES_KEY,
      JSON.stringify(normalizeCameraPreferences(preferences)),
    );
  } catch {
    // Camera controls must remain usable even if local preference storage fails.
  }
}
