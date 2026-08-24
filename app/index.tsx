import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';
import {
  Camera,
  type CapturePhotoSettings,
  type CameraDevice,
  type CameraRef,
  type Constraint,
  type FlashMode,
  type MeteringMode,
  useCameraDevice,
  useCameraDevices,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { loadImage } from 'react-native-nitro-image';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import * as Haptics from 'expo-haptics';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';

import { PRESETS } from '@/constants/presets';
import { CaptureModeCarousel } from '@/components/capture-mode-carousel';

const ALBUM_NAME = 'IntelliCam';
type CaptureMode = 'normal' | 'preset';
type TimerSeconds = 0 | 3 | 5 | 10 | 30;
type CameraFacing = 'front' | 'back';
type CameraRatio = '4:3' | '1:1' | '16:9' | 'Full';

const FLASH_MODES: FlashMode[] = ['off', 'auto', 'on'];
const ASPECT_RATIOS: CameraRatio[] = ['4:3', '1:1', '16:9', 'Full'];
const TIMER_OPTIONS: TimerSeconds[] = [0, 3, 5, 10, 30];
const METERING_RESET_MS = 5000;
const EXPOSURE_MIN = -2;
const EXPOSURE_MAX = 2;
const EXPOSURE_STEP = 0.2;
const EXPOSURE_TRACK_HEIGHT = 72;
const EXPOSURE_DRAG_PIXELS_PER_EV = EXPOSURE_TRACK_HEIGHT / (EXPOSURE_MAX - EXPOSURE_MIN);
const ZOOM_TRANSITION_MS = 180;
const ZOOM_RULER_MIN = 0.5;
const ZOOM_RULER_MAX = 10;
const ZOOM_RULER_TICK_STEP = 0.05;
const ZOOM_RULER_TICK_SPACING = 6.5;
const ZOOM_RULER_PIXELS_PER_ZOOM = ZOOM_RULER_TICK_SPACING / ZOOM_RULER_TICK_STEP;
const ZOOM_RULER_LABEL_WIDTH = 52;
const ZOOM_EASING = Easing.bezier(0.23, 1, 0.32, 1);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
interface FocusPoint {
  screenX: number;
  screenY: number;
  viewX: number;
  viewY: number;
}

interface LatestPhoto {
  key: string;
  uri: string;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function getActiveCameraZoom(
  displayZoom: number,
  displayMinimum: number,
  displayMaximum: number,
  cameraMinimum: number,
  cameraMaximum: number,
  cameraNeutral: number,
  usingDedicatedUltraWide: boolean,
  hasIntegratedUltraWide: boolean,
) {
  'worklet';
  const clampedDisplayZoom = Math.max(displayMinimum, Math.min(displayMaximum, displayZoom));
  let targetZoom: number;

  if (usingDedicatedUltraWide) {
    targetZoom = cameraNeutral
      * (Math.min(1, clampedDisplayZoom) / ZOOM_RULER_MIN);
  } else if (clampedDisplayZoom < 1) {
    if (hasIntegratedUltraWide && cameraNeutral > cameraMinimum) {
      const progressToWide = (clampedDisplayZoom - ZOOM_RULER_MIN)
        / (1 - ZOOM_RULER_MIN);
      targetZoom = cameraMinimum
        + (cameraNeutral - cameraMinimum) * progressToWide;
    } else {
      // A dedicated ultrawide requires a camera-session change. Keep the
      // current lens stable while dragging, then switch once on release.
      targetZoom = cameraNeutral;
    }
  } else {
    targetZoom = cameraNeutral * clampedDisplayZoom;
  }

  return Math.max(cameraMinimum, Math.min(cameraMaximum, targetZoom));
}

function getNativeExposureBias(
  displayValue: number,
  displayMinimum: number,
  displayMaximum: number,
  deviceMinimum: number,
  deviceMaximum: number,
) {
  if (Platform.OS !== 'android') return displayValue;

  if (displayValue < 0 && displayMinimum < 0) {
    return Math.round((displayValue / displayMinimum) * deviceMinimum);
  }
  if (displayValue > 0 && displayMaximum > 0) {
    return Math.round((displayValue / displayMaximum) * deviceMaximum);
  }
  return 0;
}

function createZoomRulerTicks(minimum: number, maximum: number) {
  const firstTick = Math.ceil(minimum / ZOOM_RULER_TICK_STEP - 0.001);
  const lastTick = Math.floor(maximum / ZOOM_RULER_TICK_STEP + 0.001);
  return Array.from(
    { length: Math.max(0, lastTick - firstTick + 1) },
    (_, index) => Number(((firstTick + index) * ZOOM_RULER_TICK_STEP).toFixed(2)),
  );
}

function getRatioValue(
  ratio: CameraRatio,
  landscape: boolean,
  fullScreenRatio?: number,
) {
  if (ratio === 'Full') {
    const safeRatio = fullScreenRatio && Number.isFinite(fullScreenRatio) && fullScreenRatio > 0
      ? fullScreenRatio
      : 9 / 16;
    const longSide = Math.max(safeRatio, 1 / safeRatio);
    const shortSide = Math.min(safeRatio, 1 / safeRatio);
    return landscape ? longSide : shortSide;
  }

  const [first, second] = ratio.split(':').map(Number);
  const longSide = Math.max(first, second);
  const shortSide = Math.min(first, second);
  return landscape ? longSide / shortSide : shortSide / longSide;
}

function getPreviewFrame(
  containerWidth: number,
  containerHeight: number,
  ratio: CameraRatio,
  landscape: boolean,
) {
  const targetRatio = getRatioValue(ratio, landscape, containerWidth / containerHeight);
  let frameWidth = containerWidth;
  let frameHeight = frameWidth / targetRatio;

  if (frameHeight > containerHeight) {
    frameHeight = containerHeight;
    frameWidth = frameHeight * targetRatio;
  }

  return {
    left: (containerWidth - frameWidth) / 2,
    top: (containerHeight - frameHeight) / 2,
    width: frameWidth,
    height: frameHeight,
  };
}

function getCenteredCrop(
  sourceWidth: number,
  sourceHeight: number,
  ratio: CameraRatio,
  fullScreenRatio?: number,
) {
  const landscape = sourceWidth >= sourceHeight;
  const targetRatio = getRatioValue(ratio, landscape, fullScreenRatio);
  const sourceRatio = sourceWidth / sourceHeight;

  if (Math.abs(sourceRatio - targetRatio) < 0.001) return undefined;

  if (sourceRatio > targetRatio) {
    const width = Math.round(sourceHeight * targetRatio);
    return {
      originX: Math.floor((sourceWidth - width) / 2),
      originY: 0,
      width,
      height: sourceHeight,
    };
  }

  const height = Math.round(sourceWidth / targetRatio);
  return {
    originX: 0,
    originY: Math.floor((sourceHeight - height) / 2),
    width: sourceWidth,
    height,
  };
}

async function cropPhotoForAspectRatio(
  sourceFilePath: string,
  ratio: CameraRatio,
  fullScreenRatio: number,
) {
  const sourceUri = `file://${sourceFilePath}`;
  if (ratio === '4:3') return sourceUri;

  const normalizedImage = await loadImage({ filePath: sourceFilePath });
  try {
    const crop = getCenteredCrop(
      normalizedImage.width,
      normalizedImage.height,
      ratio,
      fullScreenRatio,
    );
    if (!crop) return sourceUri;

    const croppedImage = normalizedImage.crop(
      crop.originX,
      crop.originY,
      crop.originX + crop.width,
      crop.originY + crop.height,
    );
    try {
      return `file://${await croppedImage.saveToTemporaryFileAsync('jpg', 92)}`;
    } finally {
      croppedImage.dispose();
    }
  } finally {
    normalizedImage.dispose();
  }
}

async function savePhotoToAlbum(localUri: string): Promise<LatestPhoto> {
  const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
  if (album) {
    const asset = await MediaLibrary.createAssetAsync(localUri, album);
    return { key: asset.id, uri: asset.uri };
  }

  const createdAlbum = await MediaLibrary.createAlbumAsync(
    ALBUM_NAME,
    undefined,
    false,
    localUri,
  );
  const page = await MediaLibrary.getAssetsAsync({
    album: createdAlbum,
    first: 1,
    mediaType: MediaLibrary.MediaType.photo,
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
  });
  const asset = page.assets[0];
  return asset
    ? { key: asset.id, uri: asset.uri }
    : { key: `${Date.now()}-${localUri}`, uri: localUri };
}

function getNeutralZoom(device: CameraDevice | undefined) {
  if (!device) return 1;

  const minZoom = device.minZoom;
  const maxZoom = device.maxZoom;
  const hasUltraWideLens = device.physicalDevices.some(
    (physicalDevice) => physicalDevice.type === 'ultra-wide-angle',
  );
  const hasWideLens = device.physicalDevices.some(
    (physicalDevice) => physicalDevice.type === 'wide-angle',
  );

  if (minZoom < 1) return Math.max(minZoom, Math.min(maxZoom, 1));

  const wideLensSwitchZoom = device.zoomLensSwitchFactors.find(
    (factor) => factor > minZoom + 0.01,
  );
  if (wideLensSwitchZoom !== undefined) {
    return Math.max(minZoom, Math.min(maxZoom, wideLensSwitchZoom));
  }

  if (hasUltraWideLens && hasWideLens) {
    return Math.max(minZoom, Math.min(maxZoom, minZoom * 2));
  }

  return Math.max(minZoom, Math.min(maxZoom, 1));
}

function hasZoomLens(device: CameraDevice | undefined, type: 'ultra-wide-angle' | 'wide-angle') {
  if (!device) return false;
  return device.type === type
    || device.physicalDevices.some((physicalDevice) => physicalDevice.type === type);
}

function getPrimaryBackDevice(
  defaultDevice: CameraDevice | undefined,
  preferredDevice: CameraDevice | undefined,
  devices: CameraDevice[],
) {
  if (defaultDevice?.position === 'back') return defaultDevice;
  if (hasZoomLens(preferredDevice, 'wide-angle')) return preferredDevice;

  const backDevices = devices.filter((device) => device.position === 'back');
  const virtualWideDevice = backDevices
    .filter((device) => device.isVirtualDevice && hasZoomLens(device, 'wide-angle'))
    .sort((first, second) => second.physicalDevices.length - first.physicalDevices.length)[0];

  return virtualWideDevice
    ?? backDevices.find((device) => device.type === 'wide-angle')
    ?? preferredDevice;
}

function getDedicatedUltraWideDevice(
  primaryDevice: CameraDevice | undefined,
  devices: CameraDevice[],
) {
  const backDevices = devices.filter(
    (device) => device.position === 'back' && device.id !== primaryDevice?.id,
  );
  const explicitlyUltraWide = backDevices.find((device) => device.type === 'ultra-wide-angle');
  if (explicitlyUltraWide) return explicitlyUltraWide;

  const primaryFocalLength = primaryDevice?.focalLength;
  if (primaryFocalLength === undefined || primaryFocalLength <= 0) return undefined;

  return backDevices
    .filter((device) => (
      device.focalLength !== undefined
      && device.focalLength > 0
      && device.focalLength < primaryFocalLength * 0.8
    ))
    .sort((first, second) => (first.focalLength ?? 0) - (second.focalLength ?? 0))[0];
}

function isCameraLifecycleCancellation(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('OperationCanceledException')
    || message.includes('Camera is not active');
}

function getCameraErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n')[0] || 'The camera could not be started.';
}

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions({
    granularPermissions: ['photo'],
  });
  const cameraRef = useRef<CameraRef>(null);
  const [facing, setFacing] = useState<CameraFacing>('back');
  const defaultBackDevice = useCameraDevice('back');
  const preferredBackDevice = useCameraDevice('back', {
    physicalDevices: ['ultra-wide-angle', 'wide-angle', 'telephoto'],
  });
  const frontDevice = useCameraDevice('front');
  const cameraDevices = useCameraDevices();
  const [selectedBackDeviceId, setSelectedBackDeviceId] = useState<string>();
  const primaryBackDevice = useMemo(
    () => getPrimaryBackDevice(defaultBackDevice, preferredBackDevice, cameraDevices),
    [cameraDevices, defaultBackDevice, preferredBackDevice],
  );
  const dedicatedUltraWideDevice = useMemo(
    () => getDedicatedUltraWideDevice(primaryBackDevice, cameraDevices),
    [cameraDevices, primaryBackDevice],
  );
  const selectedBackDevice = selectedBackDeviceId
    ? cameraDevices.find((device) => device.id === selectedBackDeviceId)
    : undefined;
  const cameraDevice = facing === 'back'
    ? selectedBackDevice ?? primaryBackDevice
    : frontDevice;
  const [hdrEnabled, setHdrEnabled] = useState(false);
  const [hdrApplied, setHdrApplied] = useState(false);
  const supportsNativeHdr = cameraDevice?.supportsPhotoHDR ?? false;
  const photoOutput = usePhotoOutput({
    containerFormat: 'jpeg',
    quality: hdrEnabled ? 1 : 0.92,
    qualityPrioritization: hdrEnabled
      ? 'quality'
      : cameraDevice?.supportsSpeedQualityPrioritization ? 'speed' : 'balanced',
  });
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [latestPhoto, setLatestPhoto] = useState<LatestPhoto>();
  const [presetIndex, setPresetIndex] = useState(0);
  const [cardVisible, setCardVisible] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [screenFocused, setScreenFocused] = useState(true);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('normal');
  const [modeMenuVisible, setModeMenuVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [flash, setFlash] = useState<FlashMode>('off');
  const [displayedZoom, setDisplayedZoom] = useState(1);
  const [gridLines, setGridLines] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<CameraRatio>('4:3');
  const [timerSeconds, setTimerSeconds] = useState<TimerSeconds>(0);
  const [shutterSoundEnabled, setShutterSoundEnabled] = useState(false);
  const [countdown, setCountdown] = useState<number>();
  const [focusPoint, setFocusPoint] = useState<FocusPoint>();
  const [exposureCompensation, setExposureCompensation] = useState(0);
  const [meteringLocked, setMeteringLocked] = useState(false);
  const meteringResetRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingZoomTargetRef = useRef<{
    deviceId: string;
    displayZoom: number;
    zoom: number;
  } | undefined>(undefined);
  const countdownTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const countdownResolveRef = useRef<(() => void) | undefined>(undefined);
  const countdownActiveRef = useRef(false);
  const captureSessionRef = useRef(0);
  const latestCaptureRef = useRef(0);
  const photoSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const appActiveRef = useRef(AppState.currentState === 'active');
  const screenFocusedRef = useRef(true);
  const cameraReadyRef = useRef(false);
  const cameraZoom = useSharedValue(1);
  const pinchStartZoom = useSharedValue(0);
  const exposureDragStart = useSharedValue(0);
  const rulerZoomValue = useSharedValue(1);
  const rulerDragStartZoom = useSharedValue(1);

  const enqueuePhotoSave = useCallback((
    sourceFilePath: string,
    ratio: CameraRatio,
    fullScreenRatio: number,
    captureId: number,
  ) => {
    photoSaveQueueRef.current = photoSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const processedUri = await cropPhotoForAspectRatio(
          sourceFilePath,
          ratio,
          fullScreenRatio,
        );
        const savedPhoto = await savePhotoToAlbum(processedUri);
        if (latestCaptureRef.current === captureId) {
          setLatestPhoto(savedPhoto);
        }
      })
      .catch((error: unknown) => {
        console.warn('Could not save captured photo:', error);
        if (
          latestCaptureRef.current === captureId
          && appActiveRef.current
          && screenFocusedRef.current
        ) {
          Alert.alert('Photo not saved', 'The photo was captured but could not be saved to the gallery.');
        }
      });
  }, []);

  const cancelPendingCapture = useCallback((withHapticFeedback = false) => {
    const wasCountingDown = countdownActiveRef.current;
    captureSessionRef.current += 1;
    countdownActiveRef.current = false;

    if (countdownTimeoutRef.current) {
      clearTimeout(countdownTimeoutRef.current);
      countdownTimeoutRef.current = undefined;
    }
    const resolveCountdown = countdownResolveRef.current;
    countdownResolveRef.current = undefined;
    resolveCountdown?.();

    setCountdown(undefined);
    setCapturing(false);
    if (wasCountingDown && withHapticFeedback) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      appActiveRef.current = active;
      setAppActive(active);
      if (!active) {
        cameraReadyRef.current = false;
        setCameraReady(false);
        cancelPendingCapture();
      }
    });
    return () => sub.remove();
  }, [cancelPendingCapture]);

  const loadLatestPhoto = useCallback(async () => {
    try {
      const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
      if (!album) {
        setLatestPhoto(undefined);
        return;
      }

      const page = await MediaLibrary.getAssetsAsync({
        album,
        first: 1,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      const asset = page.assets[0];
      setLatestPhoto(asset ? { key: asset.id, uri: asset.uri } : undefined);
    } catch (error) {
      console.warn('Could not load the latest IntelliCam photo:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      screenFocusedRef.current = true;
      setScreenFocused(true);
      void loadLatestPhoto();
      return () => {
        screenFocusedRef.current = false;
        cameraReadyRef.current = false;
        setCameraReady(false);
        setScreenFocused(false);
        cancelPendingCapture();
      };
    }, [cancelPendingCapture, loadLatestPhoto]),
  );

  const cancelMeteringReset = useCallback(() => {
    if (meteringResetRef.current) {
      clearTimeout(meteringResetRef.current);
      meteringResetRef.current = undefined;
    }
  }, []);

  const resetMetering = useCallback(() => {
    cancelMeteringReset();
    void cameraRef.current?.resetFocus().catch(() => undefined);
    setFocusPoint(undefined);
    setExposureCompensation(0);
    setMeteringLocked(false);
  }, [cancelMeteringReset]);

  const scheduleMeteringReset = useCallback(() => {
    cancelMeteringReset();
    meteringResetRef.current = setTimeout(resetMetering, METERING_RESET_MS);
  }, [cancelMeteringReset, resetMetering]);

  useEffect(() => cancelMeteringReset, [cancelMeteringReset]);

  const cancelZoomAnimations = useCallback(() => {
    cancelAnimation(cameraZoom);
    cancelAnimation(rulerZoomValue);
  }, [cameraZoom, rulerZoomValue]);

  useEffect(() => {
    resetMetering();
  }, [cameraDevice?.id, captureMode, facing, resetMetering]);

  useEffect(() => {
    if (!appActive || !screenFocused) resetMetering();
  }, [appActive, resetMetering, screenFocused]);

  const hasMediaPermission = mediaPermission?.granted ?? false;
  const preset = PRESETS[presetIndex];
  const isNormalMode = captureMode === 'normal';
  const neutralZoom = getNeutralZoom(cameraDevice);
  const minZoom = cameraDevice?.minZoom ?? neutralZoom;
  const maxZoom = cameraDevice?.maxZoom ?? neutralZoom;
  const primaryBackNeutralZoom = getNeutralZoom(primaryBackDevice);
  const primaryBackHasIntegratedUltraWide = hasZoomLens(primaryBackDevice, 'ultra-wide-angle')
    || Boolean(
      primaryBackDevice
      && primaryBackNeutralZoom > primaryBackDevice.minZoom + 0.01,
    );
  const supportsUltraWide = facing === 'back'
    && (primaryBackHasIntegratedUltraWide || dedicatedUltraWideDevice !== undefined);
  const usingDedicatedUltraWide = facing === 'back'
    && cameraDevice?.id === dedicatedUltraWideDevice?.id;
  const zoomRangeDevice = facing === 'back' ? primaryBackDevice : cameraDevice;
  const zoomRangeNeutralZoom = getNeutralZoom(zoomRangeDevice);
  const rulerMinZoom = supportsUltraWide ? ZOOM_RULER_MIN : 1;
  const rulerMaxZoom = Math.max(
    rulerMinZoom,
    Math.min(
      ZOOM_RULER_MAX,
      zoomRangeDevice ? zoomRangeDevice.maxZoom / zoomRangeNeutralZoom : 1,
    ),
  );
  const getRulerZoomOption = (requestedDisplayZoom: number) => {
    const displayZoom = clamp(requestedDisplayZoom, rulerMinZoom, rulerMaxZoom);
    const device = facing === 'back'
      ? displayZoom < 1 && !primaryBackHasIntegratedUltraWide
        ? dedicatedUltraWideDevice
        : primaryBackDevice
      : cameraDevice;
    const deviceNeutralZoom = getNeutralZoom(device);
    let targetZoom = deviceNeutralZoom * displayZoom;

    if (displayZoom < 1 && device) {
      if (device.id === dedicatedUltraWideDevice?.id) {
        targetZoom = deviceNeutralZoom * (displayZoom / ZOOM_RULER_MIN);
      } else {
        const progressToWide = (displayZoom - ZOOM_RULER_MIN) / (1 - ZOOM_RULER_MIN);
        targetZoom = device.minZoom
          + (deviceNeutralZoom - device.minZoom) * progressToWide;
      }
    }

    return {
      device,
      displayZoom,
      targetZoom: device ? clamp(targetZoom, device.minZoom, device.maxZoom) : targetZoom,
    };
  };
  const supportsExposure = cameraDevice?.supportsExposureBias ?? false;
  const deviceExposureMin = cameraDevice?.minExposureBias ?? 0;
  const deviceExposureMax = cameraDevice?.maxExposureBias ?? 0;
  const exposureMin = supportsExposure
    ? Platform.OS === 'android'
      ? deviceExposureMin < 0 ? EXPOSURE_MIN : 0
      : Math.max(EXPOSURE_MIN, deviceExposureMin)
    : 0;
  const exposureMax = supportsExposure
    ? Platform.OS === 'android'
      ? deviceExposureMax > 0 ? EXPOSURE_MAX : 0
      : Math.min(EXPOSURE_MAX, deviceExposureMax)
    : 0;
  const nativeExposureBias = getNativeExposureBias(
    exposureCompensation,
    exposureMin,
    exposureMax,
    deviceExposureMin,
    deviceExposureMax,
  );
  const meteringModes = useMemo<MeteringMode[]>(() => {
    if (!cameraDevice) return [];
    const modes: MeteringMode[] = [];
    if (cameraDevice.supportsExposureMetering) modes.push('AE');
    if (cameraDevice.supportsFocusMetering) modes.push('AF');
    if (cameraDevice.supportsWhiteBalanceMetering) modes.push('AWB');
    return modes;
  }, [cameraDevice]);
  const lockModes = useMemo<MeteringMode[]>(() => {
    if (!cameraDevice) return [];
    // The Android controller supports locked AF/AE/AWB metering even though
    // the current device capability flags report all locking as unsupported.
    if (Platform.OS === 'android') return meteringModes;

    const modes: MeteringMode[] = [];
    if (cameraDevice.supportsExposureMetering && cameraDevice.supportsExposureLocking) modes.push('AE');
    if (cameraDevice.supportsFocusMetering && cameraDevice.supportsFocusLocking) modes.push('AF');
    if (cameraDevice.supportsWhiteBalanceMetering && cameraDevice.supportsWhiteBalanceLocking) modes.push('AWB');
    return modes;
  }, [cameraDevice, meteringModes]);
  const cameraOutputs = useMemo(() => [photoOutput], [photoOutput]);
  const cameraConstraints = useMemo<Constraint[]>(() => [
    { photoHDR: hdrEnabled && supportsNativeHdr },
    { resolutionBias: photoOutput },
  ], [hdrEnabled, photoOutput, supportsNativeHdr]);
  const isLandscapeCapture = width > height;
  const previewFrame = getPreviewFrame(
    width,
    height,
    aspectRatio,
    isLandscapeCapture,
  );

  useEffect(() => {
    const supportedFlashModes: FlashMode[] = cameraDevice?.hasFlash ? FLASH_MODES : ['off'];
    const settings: CapturePhotoSettings[] = supportedFlashModes.flatMap((flashMode) => [
      { flashMode, enableShutterSound: false, enableVirtualDeviceFusion: hdrEnabled },
      { flashMode, enableShutterSound: true, enableVirtualDeviceFusion: hdrEnabled },
    ]);
    void photoOutput.prepareSettings(settings).catch(() => undefined);
  }, [cameraDevice?.hasFlash, hdrEnabled, photoOutput]);

  const zoomRulerWidth = Math.max(220, Math.min(width - 24, 420));
  const zoomRulerTicks = useMemo(
    () => createZoomRulerTicks(rulerMinZoom, rulerMaxZoom),
    [rulerMaxZoom, rulerMinZoom],
  );
  const zoomRulerLabels = useMemo(
    () => zoomRulerTicks.flatMap((tick, index) => {
      const wholeZoom = Math.abs(tick - Math.round(tick)) < 0.001;
      const minimumLabel = Math.abs(tick - rulerMinZoom) < 0.001;
      if (!wholeZoom && !minimumLabel) return [];
      return [{
        index,
        label: Number.isInteger(tick) ? tick.toFixed(0) : tick.toFixed(1),
        tick,
      }];
    }),
    [rulerMinZoom, zoomRulerTicks],
  );
  const rulerTicksAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{
      translateX: zoomRulerWidth / 2
        - ZOOM_RULER_LABEL_WIDTH / 2
        - ZOOM_RULER_TICK_SPACING / 2
        - ((rulerZoomValue.get() - rulerMinZoom) / ZOOM_RULER_TICK_STEP)
          * ZOOM_RULER_TICK_SPACING,
    }],
  }), [rulerMinZoom, zoomRulerWidth]);

  const zoomReadoutAnimatedProps = useAnimatedProps(() => {
    const label = `${rulerZoomValue.get().toFixed(1)}×`;
    return { text: label, defaultValue: label };
  });

  useEffect(() => {
    cameraReadyRef.current = false;
    setCameraReady(false);
    cancelPendingCapture();
    cancelZoomAnimations();
    const pendingZoom = pendingZoomTargetRef.current;
    pendingZoomTargetRef.current = undefined;
    const nextZoom = pendingZoom && pendingZoom.deviceId === cameraDevice?.id
      ? pendingZoom.zoom
      : neutralZoom;
    const nextDisplayZoom = pendingZoom && pendingZoom.deviceId === cameraDevice?.id
      ? pendingZoom.displayZoom
      : 1;
    cameraZoom.set(Math.max(minZoom, Math.min(maxZoom, nextZoom)));
    rulerZoomValue.set(clamp(nextDisplayZoom, rulerMinZoom, rulerMaxZoom));
    setDisplayedZoom(clamp(nextDisplayZoom, rulerMinZoom, rulerMaxZoom));
  }, [
    cameraDevice?.id,
    cameraZoom,
    cancelPendingCapture,
    cancelZoomAnimations,
    facing,
    maxZoom,
    minZoom,
    neutralZoom,
    rulerMaxZoom,
    rulerMinZoom,
    rulerZoomValue,
  ]);

  useEffect(() => {
    setExposureCompensation((current) => Math.max(exposureMin, Math.min(exposureMax, current)));
  }, [exposureMax, exposureMin]);

  useEffect(() => {
    if (!supportsExposure || !cameraReady || !appActive || !screenFocused) return;

    const controller = cameraRef.current?.controller;
    if (!controller) return;

    void controller.setExposureBias(nativeExposureBias).catch((error: unknown) => {
      // CameraX cancels pending controls when the camera is stopping or reconfiguring.
      if (!isCameraLifecycleCancellation(error)) {
        console.warn('Could not update camera exposure:', error);
      }
    });
  }, [appActive, cameraReady, nativeExposureBias, screenFocused, supportsExposure]);

  const changePreset = (direction: 1 | -1) => {
    setPresetIndex((i) => (i + direction + PRESETS.length) % PRESETS.length);
    setCardVisible(true);
    Haptics.selectionAsync();
  };

  const applyRulerZoom = (nextDisplayZoom: number, animated = false) => {
    const option = getRulerZoomOption(nextDisplayZoom);
    if (!option.device) return;

    setDisplayedZoom(option.displayZoom);

    if (facing === 'back' && option.device.id !== cameraDevice?.id) {
      cancelZoomAnimations();
      pendingZoomTargetRef.current = {
        deviceId: option.device.id,
        displayZoom: option.displayZoom,
        zoom: option.targetZoom,
      };
      cameraZoom.set(option.targetZoom);
      rulerZoomValue.set(option.displayZoom);
      setSelectedBackDeviceId(
        option.device.id === primaryBackDevice?.id ? undefined : option.device.id,
      );
    } else if (animated) {
      cancelZoomAnimations();
      cameraZoom.set(withTiming(option.targetZoom, {
        duration: ZOOM_TRANSITION_MS,
        easing: ZOOM_EASING,
      }));
      rulerZoomValue.set(withTiming(option.displayZoom, {
        duration: ZOOM_TRANSITION_MS,
        easing: ZOOM_EASING,
      }));
    } else {
      cancelZoomAnimations();
      cameraZoom.set(option.targetZoom);
      rulerZoomValue.set(option.displayZoom);
    }
  };

  const finishRulerZoom = (nextDisplayZoom: number) => {
    applyRulerZoom(nextDisplayZoom);
    void Haptics.selectionAsync();
  };

  const selectRulerZoom = (nextDisplayZoom: number) => {
    applyRulerZoom(nextDisplayZoom, true);
    void Haptics.selectionAsync();
  };

  const swipe = Gesture.Pan()
    .enabled(!isNormalMode)
    .activeOffsetX([-30, 30])
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 50) {
        runOnJS(changePreset)(e.translationX < 0 ? 1 : -1);
      }
    });

  const pinch = Gesture.Pinch()
    .enabled(isNormalMode)
    .onBegin(() => {
      pinchStartZoom.set(rulerZoomValue.get());
      cancelAnimation(cameraZoom);
      cancelAnimation(rulerZoomValue);
    })
    .onUpdate((event) => {
      const nextZoom = Math.max(
        rulerMinZoom,
        Math.min(rulerMaxZoom, pinchStartZoom.get() * event.scale),
      );
      rulerZoomValue.set(nextZoom);
      cameraZoom.set(getActiveCameraZoom(
        nextZoom,
        rulerMinZoom,
        rulerMaxZoom,
        minZoom,
        maxZoom,
        neutralZoom,
        usingDedicatedUltraWide,
        primaryBackHasIntegratedUltraWide,
      ));
    })
    .onEnd(() => {
      scheduleOnRN(finishRulerZoom, rulerZoomValue.get());
    });

  const zoomRulerPan = Gesture.Pan()
    .enabled(isNormalMode && cameraDevice !== undefined && rulerMaxZoom > rulerMinZoom)
    .activeOffsetX([-4, 4])
    .failOffsetY([-16, 16])
    .onBegin(() => {
      rulerDragStartZoom.set(rulerZoomValue.get());
      cancelAnimation(cameraZoom);
      cancelAnimation(rulerZoomValue);
    })
    .onUpdate((event) => {
      const nextZoom = Math.max(
        rulerMinZoom,
        Math.min(
          rulerMaxZoom,
          rulerDragStartZoom.get() - event.translationX / ZOOM_RULER_PIXELS_PER_ZOOM,
        ),
      );
      rulerZoomValue.set(nextZoom);
      cameraZoom.set(getActiveCameraZoom(
        nextZoom,
        rulerMinZoom,
        rulerMaxZoom,
        minZoom,
        maxZoom,
        neutralZoom,
        usingDedicatedUltraWide,
        primaryBackHasIntegratedUltraWide,
      ));
    })
    .onEnd(() => {
      scheduleOnRN(finishRulerZoom, rulerZoomValue.get());
    });

  const cameraGesture = Gesture.Simultaneous(swipe, pinch);

  const cycleFlash = () => {
    setFlash((current) => FLASH_MODES[(FLASH_MODES.indexOf(current) + 1) % FLASH_MODES.length]);
    Haptics.selectionAsync();
  };

  const focusAt = async (event: GestureResponderEvent) => {
    if (!isNormalMode || settingsVisible || modeMenuVisible) return;
    const { locationX, locationY } = event.nativeEvent;
    const camera = cameraRef.current;
    if (!camera || meteringModes.length === 0) {
      Alert.alert('Focus unavailable', 'This camera does not support point focus or metering.');
      return;
    }
    const point = {
      screenX: previewFrame.left + locationX,
      screenY: previewFrame.top + locationY,
      viewX: locationX,
      viewY: locationY,
    };
    setFocusPoint(point);
    setExposureCompensation(0);
    setMeteringLocked(false);
    scheduleMeteringReset();
    void Haptics.selectionAsync();
    try {
      await camera.focusTo(
        { x: locationX, y: locationY },
        {
          modes: meteringModes,
          responsiveness: 'snappy',
          adaptiveness: 'continuous',
          autoResetAfter: METERING_RESET_MS / 1000,
        },
      );
    } catch (error) {
      resetMetering();
      Alert.alert('Focus failed', String(error));
    }
  };

  const changeExposure = (direction: 1 | -1) => {
    if (!supportsExposure) return;
    setExposureCompensation((current) =>
      Math.max(
        exposureMin,
        Math.min(exposureMax, Number((current + direction * EXPOSURE_STEP).toFixed(1))),
      ),
    );
    if (!meteringLocked) scheduleMeteringReset();
    Haptics.selectionAsync();
  };

  const updateExposureFromDrag = (value: number) => {
    if (!supportsExposure) return;
    setExposureCompensation(
      Math.max(exposureMin, Math.min(exposureMax, Number(value.toFixed(1)))),
    );
  };

  const finishExposureDrag = () => {
    if (!meteringLocked) scheduleMeteringReset();
    void Haptics.selectionAsync();
  };

  const exposureDrag = Gesture.Pan()
    .enabled(supportsExposure)
    .activeOffsetY([-4, 4])
    .failOffsetX([-18, 18])
    .onBegin(() => {
      exposureDragStart.value = exposureCompensation;
      runOnJS(cancelMeteringReset)();
    })
    .onUpdate((event) => {
      const nextExposure = exposureDragStart.value
        - event.translationY / EXPOSURE_DRAG_PIXELS_PER_EV;
      runOnJS(updateExposureFromDrag)(nextExposure);
    })
    .onFinalize(() => {
      runOnJS(finishExposureDrag)();
    });

  const exposureThumbTop =
    (exposureMax === exposureMin ? 0.5 : (exposureMax - exposureCompensation) / (exposureMax - exposureMin))
    * EXPOSURE_TRACK_HEIGHT;

  const toggleMeteringLock = async () => {
    const camera = cameraRef.current;
    if (!focusPoint || !camera || lockModes.length === 0) return;
    try {
      if (meteringLocked) {
        await camera.resetFocus();
        setMeteringLocked(false);
        scheduleMeteringReset();
      } else {
        cancelMeteringReset();
        await camera.focusTo(
          { x: focusPoint.viewX, y: focusPoint.viewY },
          {
            modes: lockModes,
            responsiveness: 'snappy',
            adaptiveness: 'locked',
            autoResetAfter: null,
          },
        );
        setMeteringLocked(true);
      }
      void Haptics.selectionAsync();
    } catch (error) {
      setMeteringLocked(false);
      scheduleMeteringReset();
      Alert.alert('Metering lock failed', String(error));
    }
  };

  const applyCaptureMode = (modeId: string) => {
    if (modeId === 'normal') {
      setCaptureMode('normal');
      setCardVisible(false);
    } else {
      const nextPresetIndex = PRESETS.findIndex((item) => item.id === modeId);
      if (nextPresetIndex >= 0) setPresetIndex(nextPresetIndex);
      setCaptureMode('preset');
      setCardVisible(true);
    }
    setModeMenuVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  if (!hasCameraPermission || !hasMediaPermission) {
    return (
      <View style={styles.centered}>
        <Ionicons name="camera-outline" size={40} color="#888" />
        <Text style={styles.message}>IntelliCam needs camera and photo library access.</Text>
        <Pressable
          style={styles.grantButton}
          onPress={async () => {
            if (!hasCameraPermission) await requestCameraPermission();
            if (!hasMediaPermission) await requestMediaPermission();
          }}>
          <Text style={styles.grantButtonText}>Grant access</Text>
        </Pressable>
      </View>
    );
  }

  const capture = async () => {
    if (
      capturing
      || !cameraReadyRef.current
      || !appActiveRef.current
      || !screenFocusedRef.current
    ) return;

    const captureSession = captureSessionRef.current + 1;
    captureSessionRef.current = captureSession;
    countdownActiveRef.current = timerSeconds > 0;
    setCapturing(true);
    try {
      for (let remaining: number = timerSeconds; remaining > 0; remaining -= 1) {
        if (
          captureSessionRef.current !== captureSession
          || !cameraReadyRef.current
          || !appActiveRef.current
          || !screenFocusedRef.current
        ) return;

        setCountdown(remaining);
        void Haptics.impactAsync(
          remaining === 1
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light,
        );

        await new Promise<void>((resolve) => {
          let settled = false;
          const finishTick = () => {
            if (settled) return;
            settled = true;
            countdownTimeoutRef.current = undefined;
            countdownResolveRef.current = undefined;
            resolve();
          };
          countdownResolveRef.current = finishTick;
          countdownTimeoutRef.current = setTimeout(finishTick, 1000);
        });
      }

      if (
        captureSessionRef.current !== captureSession
        || !cameraReadyRef.current
        || !appActiveRef.current
        || !screenFocusedRef.current
        || !cameraRef.current
      ) return;

      countdownActiveRef.current = false;
      setCountdown(undefined);

      const photoFile = await photoOutput.capturePhotoToFile(
        {
          flashMode: cameraDevice?.hasFlash ? flash : 'off',
          enableShutterSound: shutterSoundEnabled,
          enableVirtualDeviceFusion: hdrEnabled,
        },
        {},
      );
      const sourcePhotoUri = `file://${photoFile.filePath}`;
      latestCaptureRef.current = captureSession;
      setLatestPhoto({
        key: `${captureSession}-${sourcePhotoUri}`,
        uri: sourcePhotoUri,
      });
      setCapturing(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      enqueuePhotoSave(photoFile.filePath, aspectRatio, width / height, captureSession);
    } catch (error) {
      if (captureSessionRef.current === captureSession) {
        Alert.alert('Capture failed', String(error));
      }
    } finally {
      if (captureSessionRef.current === captureSession) {
        countdownActiveRef.current = false;
        setCountdown(undefined);
        setCapturing(false);
      }
    }
  };

  return (
    <GestureDetector gesture={cameraGesture}>
      <View style={styles.container}>
        <View style={[styles.previewFrame, previewFrame]}>
          {appActive && screenFocused && cameraDevice && (
            <Camera
              key={facing}
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={cameraDevice}
              outputs={cameraOutputs}
              constraints={cameraConstraints}
              isActive={appActive && screenFocused}
              zoom={cameraZoom}
              mirrorMode="auto"
              orientationSource="device"
              resizeMode="cover"
              onSessionConfigSelected={(config) => {
                setHdrApplied(
                  hdrEnabled
                  && (supportsNativeHdr ? config.isPhotoHDREnabled : true),
                );
              }}
              onConfigured={() => {
                cameraReadyRef.current = false;
                setCameraReady(false);
              }}
              onPreviewStarted={() => {
                if (appActiveRef.current && screenFocusedRef.current) {
                  cameraReadyRef.current = true;
                  setCameraReady(true);
                }
              }}
              onPreviewStopped={() => {
                cameraReadyRef.current = false;
                setCameraReady(false);
              }}
              onStopped={() => {
                cameraReadyRef.current = false;
                setCameraReady(false);
              }}
              onError={(error) => {
                if (isCameraLifecycleCancellation(error)) return;

                cameraReadyRef.current = false;
                setCameraReady(false);
                cancelPendingCapture();
                Alert.alert('Camera unavailable', getCameraErrorMessage(error));
              }}
            />
          )}

          {isNormalMode && (
            <Pressable
              accessibilityLabel="Camera preview"
              accessibilityHint="Tap a subject to focus and meter"
              onPress={focusAt}
              style={StyleSheet.absoluteFill}
            />
          )}

          {gridLines && (
            <View pointerEvents="none" style={styles.grid}>
              <View style={[styles.gridLineVertical, { left: '33.333%' }]} />
              <View style={[styles.gridLineVertical, { left: '66.666%' }]} />
              <View style={[styles.gridLineHorizontal, { top: '33.333%' }]} />
              <View style={[styles.gridLineHorizontal, { top: '66.666%' }]} />
            </View>
          )}
        </View>

        {countdown !== undefined && (
          <Animated.View
            key={countdown}
            accessible
            accessibilityLabel={`Taking photo in ${countdown} ${countdown === 1 ? 'second' : 'seconds'}. Tap the shutter to cancel.`}
            accessibilityLiveRegion="assertive"
            entering={ZoomIn.duration(180)}
            pointerEvents="none"
            style={styles.countdown}>
            <View style={styles.countdownBadge}>
              <Text style={styles.countdownText}>{countdown}</Text>
            </View>
            <Text style={styles.countdownHint}>Tap shutter to cancel</Text>
          </Animated.View>
        )}

        {isNormalMode && focusPoint && (
          <Animated.View
            entering={FadeIn.duration(120)}
            exiting={FadeOut.duration(160)}
            pointerEvents="box-none"
            style={[
              styles.meteringControl,
              {
                left: Math.min(width - 126, focusPoint.screenX - 38),
                top: Math.min(height - insets.bottom - 270, focusPoint.screenY - 38),
              },
            ]}>
            <View
              accessible
              accessibilityLabel={`Focus point. Exposure ${exposureCompensation > 0 ? 'plus ' : ''}${exposureCompensation.toFixed(1)} EV. ${meteringLocked ? 'Locked' : 'Automatic reset enabled'}`}
              style={[styles.focusReticle, meteringLocked && styles.focusReticleLocked]}>
              <View style={styles.focusReticleCenter} />
            </View>
            <GestureDetector gesture={exposureDrag}>
              <View
                accessible
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                accessibilityHint="Swipe up to brighten or down to darken"
                accessibilityLabel="Exposure"
                accessibilityRole="adjustable"
                accessibilityState={{ disabled: !supportsExposure }}
                accessibilityValue={{
                  min: exposureMin,
                  max: exposureMax,
                  now: exposureCompensation,
                  text: `${exposureCompensation > 0 ? 'plus ' : ''}${exposureCompensation.toFixed(1)} EV`,
                }}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === 'increment') changeExposure(1);
                  if (event.nativeEvent.actionName === 'decrement') changeExposure(-1);
                }}
                style={styles.exposureControl}>
                <View style={styles.exposureTrack}>
                  <View style={styles.exposureTrackLine} />
                  <View style={styles.exposureTrackZero} />
                  <View style={[styles.exposureThumb, { top: exposureThumbTop - 6 }]} />
                </View>
              </View>
            </GestureDetector>
            <Pressable
              accessibilityLabel={meteringLocked ? 'Unlock focus and exposure' : 'Lock focus and exposure'}
              accessibilityRole="button"
              accessibilityState={{ checked: meteringLocked, disabled: lockModes.length === 0 }}
              disabled={lockModes.length === 0}
              hitSlop={8}
              onPress={toggleMeteringLock}
              style={[styles.meteringLock, meteringLocked && styles.meteringLockActive]}>
              <Ionicons name={meteringLocked ? 'lock-closed' : 'lock-open-outline'} size={18} color="white" />
            </Pressable>
          </Animated.View>
        )}

        {!isNormalMode && cardVisible && (
          <Animated.View
            key={preset.id}
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(120)}
            style={styles.card}>
            <Pressable onPress={() => setCardVisible(false)}>
              <View style={styles.cardHeader}>
                <Ionicons name={preset.icon} size={20} color={preset.tint} />
                <Text style={styles.cardTitle}>{preset.name}</Text>
              </View>
              <View style={styles.chips}>
                <Text style={styles.chip}>ISO {preset.iso}</Text>
                <Text style={styles.chip}>{preset.shutter}</Text>
                <Text style={styles.chip}>{preset.whiteBalance}K</Text>
                {preset.raw && <Text style={styles.chip}>RAW</Text>}
              </View>
              <View style={styles.tipRow}>
                <Ionicons name="information-circle-outline" size={13} color={preset.tint} />
                <Text style={[styles.tip, { color: preset.tint }]}>{preset.tip}</Text>
              </View>
            </Pressable>
          </Animated.View>
        )}

        {!isNormalMode && !cardVisible && (
          <Pressable
            style={[styles.pill, { top: insets.top + 16 }]}
            onPress={() => setCardVisible(true)}>
            <Ionicons name={preset.icon} size={14} color={preset.tint} />
            <Text style={styles.pillText}>{preset.name}</Text>
          </Pressable>
        )}

        <Pressable
          accessibilityLabel="Camera settings"
          accessibilityHint="Change flash, zoom, camera, and photo size"
          accessibilityRole="button"
          onPress={() => {
            setModeMenuVisible(false);
            setSettingsVisible((visible) => !visible);
          }}
          style={[styles.settingsButton, { top: insets.top + 16 }]}>
          <Ionicons name="ellipsis-horizontal" size={24} color="white" />
        </Pressable>

        {isNormalMode && (
          <View style={[styles.normalTopControls, { top: insets.top + 16 }]}>
            <Pressable
              accessibilityLabel={`Flash ${flash}`}
              accessibilityRole="button"
              onPress={cycleFlash}
              style={styles.roundControl}>
              <Ionicons
                name={flash === 'off' ? 'flash-off' : flash === 'auto' ? 'flash-outline' : 'flash'}
                size={20}
                color="white"
              />
              {flash === 'auto' && <Text style={styles.flashAuto}>A</Text>}
            </Pressable>
            <Pressable
              accessibilityLabel="Flip camera"
              accessibilityRole="button"
              onPress={() => {
                cameraReadyRef.current = false;
                setCameraReady(false);
                cancelPendingCapture();
                setFacing((current) => (current === 'back' ? 'front' : 'back'));
                Haptics.selectionAsync();
              }}
              style={styles.roundControl}>
              <Ionicons name="camera-reverse-outline" size={22} color="white" />
            </Pressable>
          </View>
        )}

        {!isNormalMode && <View style={[styles.dots, { bottom: insets.bottom + 124 }]}>
          {PRESETS.map((p, i) => (
            <View
              key={p.id}
              style={[
                styles.dot,
                i === presetIndex && { backgroundColor: preset.tint, transform: [{ scale: 1.3 }] },
              ]}
            />
          ))}
        </View>}

        {isNormalMode && (
          <View style={[styles.zoomCluster, { bottom: insets.bottom + 112 }]}>
            <View
              accessible
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              accessibilityHint="Swipe the ruler, pinch the preview, or tap a numbered zoom mark"
              accessibilityLabel="Camera zoom"
              accessibilityRole="adjustable"
              accessibilityState={{ disabled: rulerMaxZoom <= rulerMinZoom }}
              accessibilityValue={{
                min: Math.round(rulerMinZoom * 10),
                max: Math.round(rulerMaxZoom * 10),
                now: Math.round(displayedZoom * 10),
                text: `${displayedZoom.toFixed(1)} times`,
              }}
              onAccessibilityAction={({ nativeEvent }) => {
                if (nativeEvent.actionName !== 'increment' && nativeEvent.actionName !== 'decrement') return;
                const direction = nativeEvent.actionName === 'increment' ? 1 : -1;
                selectRulerZoom(displayedZoom + direction * 0.1);
              }}
              style={styles.zoomReadout}>
              <AnimatedTextInput
                accessible={false}
                animatedProps={zoomReadoutAnimatedProps}
                defaultValue={`${displayedZoom.toFixed(1)}×`}
                editable={false}
                focusable={false}
                pointerEvents="none"
                style={styles.zoomReadoutText}
                underlineColorAndroid="transparent"
              />
            </View>
            <GestureDetector gesture={zoomRulerPan}>
              <View style={[styles.zoomRuler, { width: zoomRulerWidth }]}>
                <Animated.View
                  pointerEvents="box-none"
                  style={[
                    styles.zoomRulerTicks,
                    { width: zoomRulerTicks.length * ZOOM_RULER_TICK_SPACING + ZOOM_RULER_LABEL_WIDTH },
                    rulerTicksAnimatedStyle,
                  ]}>
                  <View pointerEvents="none" style={styles.zoomRulerTickTrack}>
                    {zoomRulerTicks.map((tick) => {
                      const wholeZoom = Math.abs(tick - Math.round(tick)) < 0.001;
                      const medium = !wholeZoom
                        && Math.abs(tick * 2 - Math.round(tick * 2)) < 0.001;
                      return (
                        <View key={tick} style={styles.zoomRulerTickSlot}>
                          <View style={[
                            styles.zoomRulerTick,
                            medium && styles.zoomRulerTickMedium,
                            wholeZoom && styles.zoomRulerTickMajor,
                          ]} />
                        </View>
                      );
                    })}
                  </View>
                  {zoomRulerLabels.map(({ index, label, tick }) => (
                    <Pressable
                      key={`label-${tick}`}
                      accessibilityHint={`Sets camera zoom to ${label} times`}
                      accessibilityLabel={`${label} times zoom`}
                      accessibilityRole="button"
                      onPress={() => selectRulerZoom(tick)}
                      pressRetentionOffset={8}
                      style={({ pressed }) => [
                        styles.zoomRulerLabelButton,
                        { left: index * ZOOM_RULER_TICK_SPACING + ZOOM_RULER_TICK_SPACING / 2 },
                        pressed && styles.zoomRulerLabelButtonPressed,
                      ]}>
                      <Text style={styles.zoomRulerLabel}>{label}×</Text>
                    </Pressable>
                  ))}
                </Animated.View>
                <View pointerEvents="none" style={styles.zoomRulerIndicator} />
              </View>
            </GestureDetector>
          </View>
        )}

        <View style={[styles.captureControls, { bottom: insets.bottom + 28 }]}>
          <Pressable
            accessibilityLabel="View IntelliCam photos"
            accessibilityHint="Opens photos saved in the IntelliCam album"
            accessibilityRole="button"
            onPress={() => router.push('/gallery' as Href)}
            style={styles.secondaryControl}>
            {latestPhoto ? (
              <Animated.View
                key={latestPhoto.key}
                entering={ZoomIn.duration(220).springify()}
                style={styles.thumbnailFrame}>
                <Image
                  source={{ uri: latestPhoto.uri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={100}
                />
              </Animated.View>
            ) : (
              <View style={styles.thumbnailPlaceholder}>
                <Ionicons name="images-outline" size={24} color="white" />
              </View>
            )}
            <Text style={styles.controlLabel}>Gallery</Text>
          </Pressable>

          <Pressable
            accessibilityLabel={countdown !== undefined ? 'Cancel photo timer' : 'Take picture'}
            accessibilityHint={countdown !== undefined ? 'Stops the countdown without taking a photo' : undefined}
            accessibilityRole="button"
            accessibilityState={{ disabled: !cameraReady || (capturing && countdown === undefined) }}
            style={[
              styles.shutter,
              countdown !== undefined && styles.shutterCancelling,
              capturing && countdown === undefined && styles.shutterDisabled,
            ]}
            disabled={!cameraReady || (capturing && countdown === undefined)}
            onPress={countdown !== undefined ? () => cancelPendingCapture(true) : capture}>
            <View
              style={[
                styles.shutterInner,
                { borderColor: preset.tint },
                countdown !== undefined && styles.shutterInnerCancelling,
              ]}>
              {countdown !== undefined && <Ionicons name="close" size={30} color="white" />}
            </View>
          </Pressable>

          <Pressable
            accessibilityLabel="Change capture mode"
            accessibilityHint="Choose Normal or Smart Preset mode"
            accessibilityRole="button"
            onPress={() => {
              setSettingsVisible(false);
              setModeMenuVisible((visible) => !visible);
            }}
            style={styles.secondaryControl}>
            <Ionicons name="options-outline" size={25} color="white" />
            <Text style={styles.controlLabel}>{isNormalMode ? 'Normal' : preset.name.replace(' photography', '')}</Text>
          </Pressable>
        </View>

        <CaptureModeCarousel
          visible={modeMenuVisible}
          selectedId={isNormalMode ? 'normal' : preset.id}
          onClose={() => setModeMenuVisible(false)}
          onApply={applyCaptureMode}
        />

        {settingsVisible && (
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(120)}
            style={[styles.settingsSheet, { top: insets.top + 68 }]}>
            <Text style={styles.sheetTitle}>Camera settings</Text>
            <View style={styles.iconSettingsRow}>
              <Pressable
                accessibilityLabel="Gridlines"
                accessibilityRole="switch"
                accessibilityState={{ checked: gridLines }}
                onPress={() => {
                  setGridLines((enabled) => !enabled);
                  void Haptics.selectionAsync();
                }}
                style={({ pressed }) => [
                  styles.iconSettingButton,
                  gridLines && styles.iconSettingButtonActive,
                  pressed && styles.iconSettingButtonPressed,
                ]}>
                <Feather
                  name="hash"
                  size={24}
                  color={gridLines ? '#FFD400' : 'white'}
                />
              </Pressable>

              <Pressable
                accessibilityLabel="Shutter sound"
                accessibilityRole="switch"
                accessibilityState={{ checked: shutterSoundEnabled }}
                onPress={() => {
                  setShutterSoundEnabled((enabled) => !enabled);
                  void Haptics.selectionAsync();
                }}
                style={({ pressed }) => [
                  styles.iconSettingButton,
                  shutterSoundEnabled && styles.iconSettingButtonActive,
                  pressed && styles.iconSettingButtonPressed,
                ]}>
                <Ionicons
                  name={shutterSoundEnabled ? 'volume-high' : 'volume-mute-outline'}
                  size={25}
                  color={shutterSoundEnabled ? '#FFD400' : 'white'}
                />
              </Pressable>

              <Pressable
                accessibilityLabel="HDR"
                accessibilityHint={supportsNativeHdr
                  ? 'Uses the camera native HDR photo format'
                  : 'Uses enhanced quality processing and available camera fusion'}
                accessibilityRole="switch"
                accessibilityState={{ checked: hdrEnabled, busy: hdrEnabled && !hdrApplied }}
                onPress={() => {
                  cameraReadyRef.current = false;
                  setCameraReady(false);
                  setHdrApplied(false);
                  setHdrEnabled((enabled) => !enabled);
                  void Haptics.selectionAsync();
                }}
                style={({ pressed }) => [
                  styles.iconSettingButton,
                  hdrEnabled && styles.iconSettingButtonActive,
                  pressed && styles.iconSettingButtonPressed,
                ]}>
                <View style={[styles.hdrBadge, hdrEnabled && styles.hdrBadgeActive]}>
                  <Text
                    allowFontScaling={false}
                    style={[styles.hdrBadgeText, hdrEnabled && styles.hdrBadgeTextActive]}>
                    HDR
                  </Text>
                </View>
              </Pressable>
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingHeading}>
                <Ionicons name="scan-outline" size={18} color="#bbb" />
                <Text style={styles.settingLabel}>Aspect ratio</Text>
              </View>
              <View style={styles.segmented}>
                {ASPECT_RATIOS.map((ratio) => (
                  <Pressable
                    key={ratio}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: aspectRatio === ratio }}
                    onPress={() => {
                      setAspectRatio(ratio);
                      void Haptics.selectionAsync();
                    }}
                    style={[styles.segment, aspectRatio === ratio && styles.segmentActive]}>
                    <Text style={[styles.segmentText, aspectRatio === ratio && styles.segmentTextActive]}>
                      {ratio}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingHeading}>
                <Ionicons name="timer-outline" size={18} color="#bbb" />
                <Text style={styles.settingLabel}>Timer</Text>
              </View>
              <View style={styles.segmented}>
                {TIMER_OPTIONS.map((seconds) => (
                  <Pressable
                    key={seconds}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: timerSeconds === seconds }}
                    onPress={() => {
                      setTimerSeconds(seconds);
                      void Haptics.selectionAsync();
                    }}
                    style={[styles.segment, timerSeconds === seconds && styles.segmentActive]}>
                    <Text style={[styles.segmentText, timerSeconds === seconds && styles.segmentTextActive]}>
                      {seconds === 0 ? 'Off' : `${seconds}s`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  previewFrame: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: 'black',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
    backgroundColor: 'black',
  },
  message: {
    textAlign: 'center',
    color: '#ccc',
    fontSize: 15,
  },
  grantButton: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  grantButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  card: {
    position: 'absolute',
    alignSelf: 'center',
    top: '34%',
    width: 250,
    backgroundColor: 'rgba(20,20,20,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: '#ddd',
    fontSize: 12,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  tip: {
    fontSize: 12,
    flexShrink: 1,
  },
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(20,20,20,0.7)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  pillText: {
    color: 'white',
    fontSize: 13,
  },
  settingsButton: {
    position: 'absolute',
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,20,20,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  normalTopControls: {
    position: 'absolute',
    left: 18,
    flexDirection: 'row',
    gap: 10,
  },
  roundControl: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,20,20,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  flashAuto: {
    position: 'absolute',
    right: 6,
    bottom: 5,
    color: 'white',
    fontSize: 8,
    fontWeight: '800',
  },
  dots: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  zoomCluster: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 8,
  },
  zoomReadout: {
    minWidth: 58,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: 'rgba(20,20,20,0.82)',
  },
  zoomReadoutText: {
    width: 44,
    padding: 0,
    color: '#FFD400',
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  zoomRuler: {
    position: 'relative',
    height: 68,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(20,20,20,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  zoomRulerTicks: {
    position: 'absolute',
    left: 0,
    top: 7,
    height: 54,
  },
  zoomRulerTickTrack: {
    position: 'absolute',
    left: ZOOM_RULER_LABEL_WIDTH / 2,
    top: 0,
    height: 54,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  zoomRulerTickSlot: {
    width: ZOOM_RULER_TICK_SPACING,
    height: 54,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  zoomRulerLabel: {
    color: 'rgba(255,255,255,0.96)',
    fontSize: 17,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  zoomRulerLabelButton: {
    position: 'absolute',
    top: -4,
    width: ZOOM_RULER_LABEL_WIDTH,
    height: 48,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  zoomRulerLabelButtonPressed: {
    opacity: 0.55,
    transform: [{ scale: 0.97 }],
  },
  zoomRulerTick: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.58)',
  },
  zoomRulerTickMedium: {
    height: 19,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  zoomRulerTickMajor: {
    width: 2,
    height: 28,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  zoomRulerIndicator: {
    position: 'absolute',
    top: 29,
    bottom: 6,
    left: '50%',
    width: 3,
    marginLeft: -1.5,
    borderRadius: 2,
    backgroundColor: '#FFD400',
  },
  captureControls: {
    position: 'absolute',
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secondaryControl: {
    width: 64,
    alignItems: 'center',
    gap: 5,
  },
  thumbnailFrame: {
    width: 46,
    height: 46,
    overflow: 'hidden',
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: '#222',
  },
  thumbnailPlaceholder: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(20,20,20,0.7)',
  },
  controlLabel: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 3,
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  shutterCancelling: {
    backgroundColor: '#FF6B61',
  },
  shutterInnerCancelling: {
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsSheet: {
    position: 'absolute',
    right: 18,
    width: 310,
    maxHeight: '68%',
    padding: 16,
    gap: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(20,20,20,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.48)',
  },
  gridLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.48)',
  },
  countdown: {
    position: 'absolute',
    alignSelf: 'center',
    top: '39%',
    width: 220,
    alignItems: 'center',
    gap: 10,
  },
  countdownBadge: {
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 54,
    backgroundColor: 'rgba(10,10,10,0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
  },
  countdownText: {
    color: 'white',
    fontSize: 54,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  countdownHint: {
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(10,10,10,0.74)',
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  meteringControl: {
    position: 'absolute',
    width: 126,
    height: 142,
  },
  focusReticle: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFD84D',
    borderRadius: 10,
  },
  focusReticleLocked: {
    borderColor: '#FFB329',
    borderWidth: 2,
  },
  focusReticleCenter: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FFD84D',
  },
  exposureControl: {
    position: 'absolute',
    left: 84,
    top: -8,
    width: 44,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exposureTrack: {
    width: 18,
    height: EXPOSURE_TRACK_HEIGHT,
    alignItems: 'center',
  },
  exposureTrackLine: {
    width: 2,
    height: '100%',
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  exposureTrackZero: {
    position: 'absolute',
    top: '50%',
    width: 10,
    height: 2,
    marginTop: -1,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.86)',
  },
  exposureThumb: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFD84D',
    borderWidth: 1,
    borderColor: 'white',
  },
  meteringLock: {
    position: 'absolute',
    left: 0,
    top: 86,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(16,16,16,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  meteringLockActive: {
    backgroundColor: 'rgba(118,77,0,0.88)',
    borderColor: '#FFB329',
  },
  sheetTitle: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
  },
  iconSettingsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  iconSettingButton: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  iconSettingButtonActive: {
    borderColor: 'rgba(255,212,0,0.72)',
    backgroundColor: 'rgba(255,212,0,0.16)',
  },
  iconSettingButtonPressed: {
    opacity: 0.68,
  },
  hdrBadge: {
    width: 36,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'white',
    borderRadius: 5,
    borderCurve: 'continuous',
  },
  hdrBadgeActive: {
    borderColor: '#FFD400',
  },
  hdrBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    lineHeight: 13,
  },
  hdrBadgeTextActive: {
    color: '#FFD400',
  },
  settingRow: {
    gap: 8,
  },
  settingHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  settingLabel: {
    color: '#bbb',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: 'white',
  },
  segmentText: {
    color: '#bbb',
    fontSize: 12,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#111',
  },
});
