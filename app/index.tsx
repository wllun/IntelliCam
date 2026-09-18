import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';
import {
  Camera,
  type CameraDevice,
  type CameraRef,
  type FlashMode,
  type MeteringMode,
  useCameraDevice,
  useCameraDevices,
  useCameraPermission,
} from 'react-native-vision-camera';
import { loadImage } from 'react-native-nitro-image';
import { Image } from 'expo-image';
import { requireOptionalNativeModule } from 'expo';
import * as MediaLibrary from 'expo-media-library';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedReaction,
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
import {
  AUTO_CAPTURE_MODE,
  DEFAULT_CAPTURE_MODE_ID,
} from '@/constants/capture-modes';
import {
  embedPhotoMetadata,
  type CaptureLocation,
  type CapturePhotoMetadata,
} from '@/services/photo-metadata';
import {
  loadCameraPreferences,
  saveCameraPreferences,
} from '@/services/camera-preferences';
import {
  CAMERA_ASPECT_RATIOS,
  CAMERA_TIMER_SECONDS,
  type CameraAspectRatio,
  type CameraTimerSeconds,
} from '@/utils/camera-preferences.mjs';
import {
  createExposureSteps,
  findNearestExposureStepIndex,
  formatExposureValue,
} from '@/utils/exposure-control.mjs';
import MultiFrameProcessor, {
  type MultiFrameMode,
  type MultiFrameProcessResult,
} from '@/modules/multi-frame-processor';
import { resolveCapturePlan } from '@/utils/adaptive-capture.mjs';
import { useCapturePreparation } from '@/hooks/use-capture-preparation';
import { getPhotoCaptureSettings, readNativeCaptureSettings } from '@/services/capture-preparation';
import { completeCaptureMetadata, createCaptureMetadata, measureCaptureScene } from '@/services/capture-metadata';
import PortraitEffect from '@/modules/portrait-effect';
import {
  getStarPlanLabel,
  resolveStarCapturePlan,
  type StarCapturePlan,
} from '@/services/star-capture';
import {
  getLightTrailPlanLabel,
  LIGHT_TRAIL_FRAME_INTERVAL_MS,
  resolveLightTrailCapturePlan,
  type LightTrailCapturePlan,
} from '@/services/light-trail-capture';
import {
  getWaterfallPlanLabel,
  resolveWaterfallCapturePlan,
  WATERFALL_FRAME_INTERVAL_MS,
  type WaterfallCapturePlan,
} from '@/services/waterfall-capture';
import {
  getProductPlanLabel,
  resolveProductCapturePlan,
  type ProductCapturePlan,
} from '@/services/product-capture';

const ALBUM_NAME = 'IntelliCam';
const PortraitPreviewBlur = lazy(async () => {
  const module = await import('@/components/portrait-preview-blur');
  return { default: module.PortraitPreviewBlur };
});
type CameraFacing = 'front' | 'back';
type CameraRatio = CameraAspectRatio;
type PostCaptureEffect = 'portrait' | 'beauty';

interface BeautyCapturePlan {
  strategy: 'natural-beauty-processing';
  frameCount: 1;
  exposureCompensation: number;
  guidance: string;
  fallbackReason?: string;
  exposureSeconds?: undefined;
  iso?: undefined;
  whiteBalanceKelvin?: undefined;
}

const FLASH_MODES: FlashMode[] = ['off', 'auto', 'on'];
const METERING_RESET_MS = 5000;
const EXPOSURE_DISPLAY_LIMIT = 2;
const EXPOSURE_TRACK_HEIGHT = 72;
const EXPOSURE_DISPLAY_UPDATE_INTERVAL_MS = 32;
const EXPOSURE_NATIVE_UPDATE_INTERVAL_MS = 48;
const ZOOM_TRANSITION_MS = 180;
const ZOOM_RULER_MIN = 0.5;
const ZOOM_RULER_MAX = 10;
const ZOOM_RULER_TICK_STEP = 0.1;
const ZOOM_RULER_TICK_SPACING = 8;
const ZOOM_RULER_PIXELS_PER_ZOOM = ZOOM_RULER_TICK_SPACING / ZOOM_RULER_TICK_STEP;
const ZOOM_RULER_LABEL_WIDTH = 48;
const ZOOM_NATIVE_UPDATE_STEPS = 128;
const ZOOM_NATIVE_UPDATE_INTERVAL_MS = 24;
const ZOOM_EASING = Easing.bezier(0.23, 1, 0.32, 1);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
interface FocusPoint {
  screenX: number;
  screenY: number;
  viewX: number;
  viewY: number;
}

interface PortraitTarget {
  x: number;
  y: number;
}

interface LatestPhoto {
  key: string;
  uri: string;
}

interface MultiFrameProgress {
  captured: number;
  total: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function localFilePath(uriOrPath: string) {
  return uriOrPath.startsWith('file://')
    ? decodeURIComponent(uriOrPath.slice('file://'.length))
    : uriOrPath;
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

function createZoomRulerTicks(minimum: number, maximum: number) {
  const firstTick = Math.ceil(minimum / ZOOM_RULER_TICK_STEP - 0.001);
  const lastTick = Math.floor(maximum / ZOOM_RULER_TICK_STEP + 0.001);
  return Array.from(
    { length: Math.max(0, lastTick - firstTick + 1) },
    (_, index) => Number(((firstTick + index) * ZOOM_RULER_TICK_STEP).toFixed(2)),
  );
}

// Use the same device detents for special-mode preparation and the exposure UI.
function getNativeExposureBias(
  displayValue: number,
  displayMinimum: number,
  displayMaximum: number,
  deviceMinimum: number,
  deviceMaximum: number,
) {
  const steps = createExposureSteps({
    platform: Platform.OS, supported: true,
    deviceMinimum, deviceMaximum,
    displayLimit: Math.max(Math.abs(displayMinimum), Math.abs(displayMaximum)),
  });
  return steps[findNearestExposureStepIndex(steps, displayValue)].nativeValue;
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
  jpegQuality: number,
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
      return `file://${await croppedImage.saveToTemporaryFileAsync('jpg', jpegQuality)}`;
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
  const [hdrSessionConfirmed, setHdrSessionConfirmed] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [latestPhoto, setLatestPhoto] = useState<LatestPhoto>();
  const [cardVisible, setCardVisible] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [screenFocused, setScreenFocused] = useState(true);
  const [activeCaptureModeId, setActiveCaptureModeId] = useState(DEFAULT_CAPTURE_MODE_ID);
  const specialModeDisablesHdr = ['star', 'light-trail', 'waterfall'].includes(activeCaptureModeId);
  const { capabilities, supportsNativeHdr, nativeHdrRequested, photoOutput, cameraOutputs, cameraConstraints } = useCapturePreparation(
    cameraDevice, cameraRef, cameraReady, 'maximum', hdrEnabled && !specialModeDisablesHdr,
  );
  const [modeMenuVisible, setModeMenuVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [flash, setFlash] = useState<FlashMode>('off');
  const [displayedZoom, setDisplayedZoom] = useState(1);
  const [cameraZoomProp, setCameraZoomProp] = useState(1);
  const [gridLines, setGridLines] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<CameraAspectRatio>('4:3');
  const [timerSeconds, setTimerSeconds] = useState<CameraTimerSeconds>(0);
  const [shutterSoundEnabled, setShutterSoundEnabled] = useState(false);
  const [cameraPreferencesHydrated, setCameraPreferencesHydrated] = useState(false);
  const [portraitEffectEnabled, setPortraitEffectEnabled] = useState(false);
  const [portraitPreparing, setPortraitPreparing] = useState(false);
  const portraitPreparation = useRef(0);
  const getPortraitSnapshot = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera) throw new Error('Camera unavailable');
    return camera.takeSnapshot();
  }, []);
  useEffect(() => () => { portraitPreparation.current += 1; }, []);
  useEffect(() => {
    if (!appActive || !screenFocused) {
      portraitPreparation.current += 1;
      setPortraitPreparing(false);
    }
  }, [appActive, screenFocused]);
  const [portraitTarget, setPortraitTarget] = useState<PortraitTarget>({ x: 0.5, y: 0.5 });
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [captureLocation, setCaptureLocation] = useState<CaptureLocation>();
  const [countdown, setCountdown] = useState<number>();
  const [captureStatus, setCaptureStatus] = useState<string>();
  const [multiFrameProgress, setMultiFrameProgress] = useState<MultiFrameProgress>();
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
  const cameraPreferencesSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const appActiveRef = useRef(AppState.currentState === 'active');
  const screenFocusedRef = useRef(true);
  const cameraReadyRef = useRef(false);
  const queuedCameraZoomRef = useRef<number | undefined>(undefined);
  const cameraZoomUpdateTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastCameraZoomUpdateRef = useRef(0);
  const queuedExposureStepIndexRef = useRef<number | undefined>(undefined);
  const exposureDisplayUpdateTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastExposureDisplayUpdateRef = useRef(0);
  const queuedNativeExposureRef = useRef<number | undefined>(undefined);
  const nativeExposureUpdateTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastNativeExposureUpdateRef = useRef(0);
  const captureLocationRef = useRef<CaptureLocation | undefined>(undefined);
  const cameraZoom = useSharedValue(1);
  const zoomGestureActive = useSharedValue(false);
  const pinchStartZoom = useSharedValue(0);
  const exposureStepPosition = useSharedValue(0);
  const exposureDragStartIndex = useSharedValue(0);
  const exposureGestureActive = useSharedValue(false);
  const rulerZoomValue = useSharedValue(1);
  const rulerDragStartZoom = useSharedValue(1);

  const enqueuePhotoSave = useCallback((
    sourceFilePaths: string[],
    ratio: CameraRatio,
    fullScreenRatio: number,
    captureId: number,
    jpegQuality: number,
    metadata: CapturePhotoMetadata,
    location?: CaptureLocation,
    postCaptureEffect?: PostCaptureEffect,
    metadataSourceFilePath = sourceFilePaths[0],
    portraitFocus: PortraitTarget = { x: 0.5, y: 0.5 },
    multiFrameMode?: MultiFrameMode,
  ) => {
    photoSaveQueueRef.current = photoSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const referenceFilePath = sourceFilePaths[0];
        let processingSourceUri = `file://${referenceFilePath}`;
        let multiFrameResult: MultiFrameProcessResult | undefined;
        let multiFrameFailureMessage: string | undefined = metadata.capturePlan?.fallbacks
          .some((item) => item.reason === 'multi-frame-module-unavailable')
          ? 'Multi-frame processing requires a rebuilt IntelliCam app.' : undefined;
        let multiFrameFailureReason: string | undefined;
        if (multiFrameMode) {
          if (!MultiFrameProcessor || sourceFilePaths.length < 2) {
            multiFrameFailureMessage = MultiFrameProcessor
              ? 'Not enough usable frames were captured. The reference photo was saved.'
              : 'Multi-frame processing requires a rebuilt IntelliCam app.';
            multiFrameFailureReason = MultiFrameProcessor ? 'insufficient-frames' : 'multi-frame-module-unavailable';
          } else {
            try {
              multiFrameResult = await MultiFrameProcessor.processAsync(
                sourceFilePaths.map((filePath) => `file://${filePath}`),
                multiFrameMode,
                jpegQuality,
              );
              if (multiFrameResult.applied) {
                processingSourceUri = multiFrameResult.uri;
              } else {
                multiFrameFailureMessage = 'Camera motion was too strong. The reference frame was saved.';
                multiFrameFailureReason = 'alignment-rejected';
              }
            } catch (multiFrameError) {
              console.warn('Could not process aligned multi-frame capture:', multiFrameError);
              multiFrameFailureMessage = 'Frame alignment failed. The reference photo was saved.';
              multiFrameFailureReason = 'alignment-failed';
            }
          }
        }
        const processedUri = await cropPhotoForAspectRatio(
          localFilePath(processingSourceUri),
          ratio,
          fullScreenRatio,
          jpegQuality,
        );
        let finalUri = processedUri;
        const applyPortraitEffect = postCaptureEffect === 'portrait';
        const applyBeautyEffect = postCaptureEffect === 'beauty';
        let portraitApplied = false;
        let beautyApplied = false;
        let effectFailureTitle: string | undefined;
        let effectFailureMessage: string | undefined;
        if (applyPortraitEffect) {
          if (!PortraitEffect) {
            effectFailureTitle = 'Portrait effect not applied';
            effectFailureMessage = 'Portrait processing requires a rebuilt IntelliCam app.';
          } else {
            try {
              const result = await PortraitEffect.applyAsync(
                processedUri,
                jpegQuality,
                portraitFocus.x,
                portraitFocus.y,
              );
              finalUri = result.uri;
              portraitApplied = result.applied;
              if (!result.applied) {
                effectFailureTitle = 'Portrait effect not applied';
                effectFailureMessage = 'No clear foreground subject was detected. The original photo was saved. Try moving closer to the subject or improving the lighting.';
              }
            } catch (portraitError) {
              console.warn('Could not apply portrait effect:', portraitError);
              effectFailureTitle = 'Portrait effect not applied';
              effectFailureMessage = 'Portrait processing failed. The original photo was saved.';
            }
          }
        } else if (applyBeautyEffect) {
          if (!PortraitEffect?.applyBeautyAsync) {
            effectFailureTitle = 'Beauty effect not applied';
            effectFailureMessage = 'Beauty processing requires a rebuilt IntelliCam app.';
          } else {
            try {
              const result = await PortraitEffect.applyBeautyAsync(processedUri, jpegQuality);
              finalUri = result.uri;
              beautyApplied = result.applied;
              if (!result.applied) {
                effectFailureTitle = 'Beauty effect not applied';
                effectFailureMessage = 'No clear face or person was detected. The original photo was saved.';
              }
            } catch (beautyError) {
              console.warn('Could not apply Beauty effect:', beautyError);
              effectFailureTitle = 'Beauty effect not applied';
              effectFailureMessage = 'Beauty processing failed. The original photo was saved.';
            }
          }
        }
        const scene = await measureCaptureScene(`file://${referenceFilePath}`, multiFrameResult?.alignments);
        const completedMetadata = completeCaptureMetadata(
          metadata, sourceFilePaths.length, multiFrameResult, portraitApplied, scene,
          multiFrameFailureReason, effectFailureMessage ? 'portrait-not-applied' : undefined,
        );
        const finalMetadata: CapturePhotoMetadata = {
          ...completedMetadata,
          captureFrameCount: multiFrameMode ? completedMetadata.acceptedFrameCount : metadata.captureFrameCount,
          captureStrategy: multiFrameMode && !multiFrameResult?.applied
            ? 'automatic-low-light' : metadata.captureStrategy,
          captureFallbackReason: multiFrameFailureMessage ?? metadata.captureFallbackReason,
          portraitEffectRequested: applyPortraitEffect,
          portraitEffectApplied: portraitApplied,
          beautyEffectRequested: applyBeautyEffect,
          beautyEffectApplied: beautyApplied,
          processingOperations: [
            ...(multiFrameResult?.applied ? [multiFrameMode === 'light-trail'
              ? 'lighten blend trail composite' : multiFrameMode === 'waterfall'
                ? 'temporal average water smoothing' : 'frame-average noise reduction',
              'frame alignment and motion rejection'] : metadata.processingOperations ?? []),
            ...(beautyApplied ? ['natural skin smoothing'] : []),
          ],
        };
        try {
          await embedPhotoMetadata(
            `file://${metadataSourceFilePath}`,
            finalUri,
            finalMetadata,
            location,
          );
        } catch (metadataError) {
          console.warn('Could not embed photo metadata:', metadataError);
        }
        const savedPhoto = await savePhotoToAlbum(finalUri);
        if (latestCaptureRef.current === captureId) {
          setLatestPhoto(savedPhoto);
        }
        if (
          (effectFailureMessage || multiFrameFailureMessage)
          && latestCaptureRef.current === captureId
          && appActiveRef.current
          && screenFocusedRef.current
        ) {
          Alert.alert(effectFailureTitle ?? 'Multi-frame processing not applied', effectFailureMessage ?? multiFrameFailureMessage);
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

  useEffect(() => {
    captureLocationRef.current = captureLocation;
  }, [captureLocation]);

  useEffect(() => {
    if (!locationEnabled || !appActive || !screenFocused) return;

    let disposed = false;
    let subscription: Location.LocationSubscription | undefined;
    const updateLocation = (location: Location.LocationObject) => {
      if (disposed) return;
      setCaptureLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        altitude: location.coords.altitude ?? undefined,
      });
    };

    void (async () => {
      try {
        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: 120_000,
          requiredAccuracy: 500,
        });
        if (lastKnown) updateLocation(lastKnown);
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 30_000,
            distanceInterval: 25,
          },
          updateLocation,
        );
        if (disposed) subscription.remove();
      } catch (locationError) {
        console.warn('Could not update capture location:', locationError);
      }
    })();

    return () => {
      disposed = true;
      subscription?.remove();
    };
  }, [appActive, locationEnabled, screenFocused]);

  const toggleLocationMetadata = async () => {
    if (locationEnabled) {
      setLocationEnabled(false);
      setCaptureLocation(undefined);
      void Haptics.selectionAsync();
      return;
    }

    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Location not enabled',
        'Allow location access in system settings to save coordinates inside new photos.',
      );
      return;
    }
    setLocationEnabled(true);
    void Haptics.selectionAsync();
  };

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
    setCaptureStatus(undefined);
    setMultiFrameProgress(undefined);
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

  const cancelNativeZoomAnimation = useCallback(() => {
    void cameraRef.current?.cancelZoomAnimation().catch(() => undefined);
  }, []);

  const flushCameraZoom = useCallback(() => {
    cameraZoomUpdateTimerRef.current = undefined;
    const zoom = queuedCameraZoomRef.current;
    queuedCameraZoomRef.current = undefined;
    const controller = cameraRef.current?.controller;
    if (zoom === undefined || !controller) return;

    lastCameraZoomUpdateRef.current = Date.now();
    void controller.setZoom(zoom).catch((error: unknown) => {
      if (!isCameraLifecycleCancellation(error)) {
        console.warn('Could not update camera zoom:', error);
      }
    });
  }, []);

  const updateCameraZoom = useCallback((nextZoom: number) => {
    queuedCameraZoomRef.current = nextZoom;
    if (cameraZoomUpdateTimerRef.current) return;

    const elapsed = Date.now() - lastCameraZoomUpdateRef.current;
    cameraZoomUpdateTimerRef.current = setTimeout(
      flushCameraZoom,
      Math.max(0, ZOOM_NATIVE_UPDATE_INTERVAL_MS - elapsed),
    );
  }, [flushCameraZoom]);

  useEffect(() => () => {
    if (cameraZoomUpdateTimerRef.current) {
      clearTimeout(cameraZoomUpdateTimerRef.current);
      cameraZoomUpdateTimerRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    resetMetering();
  }, [activeCaptureModeId, cameraDevice?.id, facing, resetMetering]);

  const isStarMode = activeCaptureModeId === 'star';
  const isLightTrailMode = activeCaptureModeId === 'light-trail';
  const isWaterfallMode = activeCaptureModeId === 'waterfall';
  const isBeautyMode = activeCaptureModeId === 'beauty';
  const isProductMode = activeCaptureModeId === 'product';
  const isLongCaptureMode = isStarMode || isLightTrailMode || isWaterfallMode;
  const isMotionCompositeMode = isLightTrailMode || isWaterfallMode;
  const isFlashDisabledForMode = isLongCaptureMode || isBeautyMode || isProductMode;

  useEffect(() => {
    if (!appActive || !screenFocused) resetMetering();
  }, [appActive, resetMetering, screenFocused]);

  const hasMediaPermission = mediaPermission?.granted ?? false;
  const isAutoMode = activeCaptureModeId === AUTO_CAPTURE_MODE.id;
  const presetIndex = Math.max(
    0,
    PRESETS.findIndex((item) => item.id === activeCaptureModeId),
  );
  const preset = PRESETS[presetIndex];
  const starController = cameraRef.current?.controller;
  const supportsNativeLightTrailCompositing =
    Boolean(MultiFrameProcessor);
  const supportsNativeTemporalAveraging =
    Boolean(MultiFrameProcessor);
  const starCapturePlan = resolveStarCapturePlan({
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    supportsManualExposure: Boolean(cameraDevice?.supportsExposureLocking),
    supportsManualFocus: Boolean(cameraDevice?.supportsFocusLocking),
    supportsManualWhiteBalance: Boolean(cameraDevice?.supportsWhiteBalanceLocking),
    supportsFrameStacking: Boolean(MultiFrameProcessor),
    exposureSecondsRange: starController && starController.maxExposureDuration > 0
      ? {
          min: starController.minExposureDuration,
          max: starController.maxExposureDuration,
        }
      : undefined,
    isoRange: starController && starController.maxISO > 0
      ? { min: starController.minISO, max: starController.maxISO }
      : undefined,
  });
  const lightTrailCapturePlan = resolveLightTrailCapturePlan({
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    supportsManualExposure: Boolean(cameraDevice?.supportsExposureLocking),
    supportsManualWhiteBalance: Boolean(cameraDevice?.supportsWhiteBalanceLocking),
    supportsLightenCompositing: supportsNativeLightTrailCompositing,
    exposureSecondsRange: starController && starController.maxExposureDuration > 0
      ? {
          min: starController.minExposureDuration,
          max: starController.maxExposureDuration,
        }
      : undefined,
    isoRange: starController && starController.maxISO > 0
      ? { min: starController.minISO, max: starController.maxISO }
      : undefined,
  });
  const waterfallCapturePlan = resolveWaterfallCapturePlan({
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    supportsManualExposure: Boolean(cameraDevice?.supportsExposureLocking),
    supportsManualWhiteBalance: Boolean(cameraDevice?.supportsWhiteBalanceLocking),
    supportsTemporalAveraging: supportsNativeTemporalAveraging,
    exposureSecondsRange: starController && starController.maxExposureDuration > 0
      ? {
          min: starController.minExposureDuration,
          max: starController.maxExposureDuration,
        }
      : undefined,
    isoRange: starController && starController.maxISO > 0
      ? { min: starController.minISO, max: starController.maxISO }
      : undefined,
  });
  const productCapturePlan = resolveProductCapturePlan({
    supportsFocusLock: Boolean(
      cameraDevice?.supportsFocusMetering
      && (Platform.OS === 'android' || cameraDevice.supportsFocusLocking),
    ),
    supportsExposureLock: Boolean(
      cameraDevice?.supportsExposureMetering
      && (Platform.OS === 'android' || cameraDevice.supportsExposureLocking),
    ),
    supportsWhiteBalanceLock: Boolean(
      cameraDevice?.supportsWhiteBalanceMetering
      && (Platform.OS === 'android' || cameraDevice.supportsWhiteBalanceLocking),
    ),
  });
  const beautyCapturePlan: BeautyCapturePlan = {
    strategy: 'natural-beauty-processing',
    frameCount: 1,
    exposureCompensation: 0.2,
    guidance: 'Use soft, even light and keep the face unobstructed.',
  };
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
  // Quantize live updates over the reachable ruler range, not the camera's
  // often much larger native maxZoom (which made small moves look stepped).
  const nativeGestureMinZoom = getActiveCameraZoom(
    rulerMinZoom, rulerMinZoom, rulerMaxZoom, minZoom, maxZoom, neutralZoom,
    usingDedicatedUltraWide, primaryBackHasIntegratedUltraWide,
  );
  const nativeGestureMaxZoom = getActiveCameraZoom(
    rulerMaxZoom, rulerMinZoom, rulerMaxZoom, minZoom, maxZoom, neutralZoom,
    usingDedicatedUltraWide, primaryBackHasIntegratedUltraWide,
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
  const exposureSteps = useMemo(() => createExposureSteps({
    platform: Platform.OS,
    supported: supportsExposure,
    deviceMinimum: deviceExposureMin,
    deviceMaximum: deviceExposureMax,
    displayLimit: EXPOSURE_DISPLAY_LIMIT,
  }), [deviceExposureMax, deviceExposureMin, supportsExposure]);
  const exposureStepIndex = findNearestExposureStepIndex(
    exposureSteps,
    exposureCompensation,
  );
  const activeExposureStep = exposureSteps[exposureStepIndex];
  const exposureMin = exposureSteps[0].displayValue;
  const exposureMax = exposureSteps[exposureSteps.length - 1].displayValue;
  const nativeExposureBias = activeExposureStep.nativeValue;
  const exposureLabel = formatExposureValue(activeExposureStep.displayValue);
  const zeroExposureStepIndex = findNearestExposureStepIndex(exposureSteps, 0);
  const exposureZeroTop = exposureSteps.length === 1
    ? EXPOSURE_TRACK_HEIGHT / 2
    : ((exposureSteps.length - 1 - zeroExposureStepIndex) / (exposureSteps.length - 1))
      * EXPOSURE_TRACK_HEIGHT;
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
  const isLandscapeCapture = width > height;
  const previewFrame = getPreviewFrame(
    width,
    height,
    aspectRatio,
    isLandscapeCapture,
  );

  useEffect(() => {
    let active = true;
    void loadCameraPreferences().then((preferences) => {
      if (!active) return;
      setGridLines(preferences.gridLines);
      setAspectRatio(preferences.aspectRatio);
      setTimerSeconds(preferences.timerSeconds);
      setShutterSoundEnabled(preferences.shutterSoundEnabled);
      setHdrEnabled(preferences.hdrEnabled);
      setCameraPreferencesHydrated(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!cameraPreferencesHydrated) return;
    const preferences = { gridLines, aspectRatio, timerSeconds, shutterSoundEnabled, hdrEnabled };
    cameraPreferencesSaveQueueRef.current = cameraPreferencesSaveQueueRef.current
      .then(() => saveCameraPreferences(preferences));
  }, [aspectRatio, cameraPreferencesHydrated, gridLines, hdrEnabled, shutterSoundEnabled, timerSeconds]);

  useEffect(() => {
    setHdrSessionConfirmed(false);
  }, [cameraDevice?.id, nativeHdrRequested]);

  const flushDisplayedExposure = useCallback(() => {
    exposureDisplayUpdateTimerRef.current = undefined;
    const requestedIndex = queuedExposureStepIndexRef.current;
    queuedExposureStepIndexRef.current = undefined;
    if (requestedIndex === undefined) return;

    const index = Math.max(0, Math.min(exposureSteps.length - 1, requestedIndex));
    lastExposureDisplayUpdateRef.current = Date.now();
    setExposureCompensation(exposureSteps[index].displayValue);
  }, [exposureSteps]);

  const queueDisplayedExposure = useCallback((requestedIndex: number) => {
    queuedExposureStepIndexRef.current = requestedIndex;
    if (exposureDisplayUpdateTimerRef.current) return;

    const elapsed = Date.now() - lastExposureDisplayUpdateRef.current;
    exposureDisplayUpdateTimerRef.current = setTimeout(
      flushDisplayedExposure,
      Math.max(0, EXPOSURE_DISPLAY_UPDATE_INTERVAL_MS - elapsed),
    );
  }, [flushDisplayedExposure]);

  const commitDisplayedExposure = useCallback((requestedIndex: number) => {
    if (exposureDisplayUpdateTimerRef.current) {
      clearTimeout(exposureDisplayUpdateTimerRef.current);
      exposureDisplayUpdateTimerRef.current = undefined;
    }
    queuedExposureStepIndexRef.current = requestedIndex;
    flushDisplayedExposure();
  }, [flushDisplayedExposure]);

  const flushNativeExposure = useCallback(() => {
    nativeExposureUpdateTimerRef.current = undefined;
    const exposure = queuedNativeExposureRef.current;
    queuedNativeExposureRef.current = undefined;
    const controller = cameraRef.current?.controller;
    if (
      exposure === undefined
      || !controller
      || !cameraReadyRef.current
      || !appActiveRef.current
      || !screenFocusedRef.current
    ) return;

    lastNativeExposureUpdateRef.current = Date.now();
    void controller.setExposureBias(exposure).catch((error: unknown) => {
      if (!isCameraLifecycleCancellation(error)) {
        console.warn('Could not update camera exposure:', error);
      }
    });
  }, []);

  const queueNativeExposure = useCallback((exposure: number) => {
    queuedNativeExposureRef.current = exposure;
    if (nativeExposureUpdateTimerRef.current) return;

    const elapsed = Date.now() - lastNativeExposureUpdateRef.current;
    nativeExposureUpdateTimerRef.current = setTimeout(
      flushNativeExposure,
      Math.max(0, EXPOSURE_NATIVE_UPDATE_INTERVAL_MS - elapsed),
    );
  }, [flushNativeExposure]);

  const cancelExposureUpdates = useCallback(() => {
    if (exposureDisplayUpdateTimerRef.current) {
      clearTimeout(exposureDisplayUpdateTimerRef.current);
      exposureDisplayUpdateTimerRef.current = undefined;
    }
    if (nativeExposureUpdateTimerRef.current) {
      clearTimeout(nativeExposureUpdateTimerRef.current);
      nativeExposureUpdateTimerRef.current = undefined;
    }
    queuedExposureStepIndexRef.current = undefined;
    queuedNativeExposureRef.current = undefined;
  }, []);

  const zoomRulerWidth = Math.max(232, Math.min(width - 48, 320));
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

  useAnimatedReaction(
    () => {
      if (!zoomGestureActive.get()) return null;
      const range = nativeGestureMaxZoom - nativeGestureMinZoom;
      if (range <= 0) return nativeGestureMinZoom;

      const step = range / ZOOM_NATIVE_UPDATE_STEPS;
      const bucket = Math.round((cameraZoom.get() - nativeGestureMinZoom) / step);
      return Math.max(
        nativeGestureMinZoom,
        Math.min(nativeGestureMaxZoom, nativeGestureMinZoom + bucket * step),
      );
    },
    (nextZoom, previousZoom) => {
      if (nextZoom === null || nextZoom === previousZoom) return;
      scheduleOnRN(updateCameraZoom, nextZoom);
    },
    [nativeGestureMaxZoom, nativeGestureMinZoom, updateCameraZoom],
  );

  useAnimatedReaction(
    () => exposureGestureActive.get()
      ? Math.round(exposureStepPosition.get())
      : null,
    (nextIndex, previousIndex) => {
      if (nextIndex === null || nextIndex === previousIndex) return;
      scheduleOnRN(queueDisplayedExposure, nextIndex);
    },
    [queueDisplayedExposure],
  );

  const exposureThumbAnimatedStyle = useAnimatedStyle(() => {
    const maximumIndex = Math.max(0, exposureSteps.length - 1);
    const index = Math.max(0, Math.min(maximumIndex, exposureStepPosition.get()));
    const progress = maximumIndex === 0 ? 0.5 : (maximumIndex - index) / maximumIndex;
    return {
      transform: [{ translateY: progress * EXPOSURE_TRACK_HEIGHT }],
    };
  }, [exposureSteps.length]);

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
    if (cameraZoomUpdateTimerRef.current) {
      clearTimeout(cameraZoomUpdateTimerRef.current);
      cameraZoomUpdateTimerRef.current = undefined;
    }
    queuedCameraZoomRef.current = undefined;
    setCameraZoomProp(Math.max(minZoom, Math.min(maxZoom, nextZoom)));
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
    cancelExposureUpdates();
    const nextIndex = findNearestExposureStepIndex(exposureSteps, 0);
    const nextValue = exposureSteps[nextIndex].displayValue;
    exposureStepPosition.set(nextIndex);
    setExposureCompensation((current) => current === nextValue ? current : nextValue);
  }, [cameraDevice?.id, cancelExposureUpdates, exposureStepPosition, exposureSteps]);

  useEffect(() => {
    if (!exposureGestureActive.get()) {
      exposureStepPosition.set(exposureStepIndex);
    }
  }, [exposureGestureActive, exposureStepIndex, exposureStepPosition]);

  useEffect(() => {
    if (!appActive || !screenFocused) cancelExposureUpdates();
  }, [appActive, cancelExposureUpdates, screenFocused]);

  useEffect(() => {
    if (!supportsExposure || !cameraReady || !appActive || !screenFocused) {
      if (nativeExposureUpdateTimerRef.current) {
        clearTimeout(nativeExposureUpdateTimerRef.current);
        nativeExposureUpdateTimerRef.current = undefined;
      }
      queuedNativeExposureRef.current = undefined;
      return;
    }
    queueNativeExposure(nativeExposureBias);
  }, [
    appActive,
    cameraReady,
    nativeExposureBias,
    queueNativeExposure,
    screenFocused,
    supportsExposure,
  ]);

  useEffect(() => () => cancelExposureUpdates(), [cancelExposureUpdates]);

  const changePreset = (direction: 1 | -1) => {
    if (capturing) return;
    const nextPresetIndex = (presetIndex + direction + PRESETS.length) % PRESETS.length;
    setActiveCaptureModeId(PRESETS[nextPresetIndex].id);
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
      setCameraZoomProp(option.targetZoom);
      cameraZoom.set(option.targetZoom);
      rulerZoomValue.set(option.displayZoom);
      setSelectedBackDeviceId(
        option.device.id === primaryBackDevice?.id ? undefined : option.device.id,
      );
    } else if (animated) {
      cancelZoomAnimations();
      cancelNativeZoomAnimation();
      // CameraX treats `rate` as milliseconds, while AVFoundation treats it as
      // zoom factors per second. A value of 4 was effectively instant on Android.
      const nativeZoomRate = Platform.OS === 'android' ? ZOOM_TRANSITION_MS : 4;
      void cameraRef.current?.startZoomAnimation(option.targetZoom, nativeZoomRate).catch((error) => {
        if (!isCameraLifecycleCancellation(error)) {
          console.warn('Could not animate camera zoom:', error);
        }
      });
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
      cancelNativeZoomAnimation();
      cameraZoom.set(option.targetZoom);
      rulerZoomValue.set(option.displayZoom);
      if (cameraZoomUpdateTimerRef.current) {
        clearTimeout(cameraZoomUpdateTimerRef.current);
        cameraZoomUpdateTimerRef.current = undefined;
      }
      queuedCameraZoomRef.current = option.targetZoom;
      flushCameraZoom();
      setCameraZoomProp(option.targetZoom);
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
    .enabled(!isAutoMode && !capturing)
    .activeOffsetX([-30, 30])
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 50) {
        runOnJS(changePreset)(e.translationX < 0 ? 1 : -1);
      }
    });

  const pinch = Gesture.Pinch()
    .enabled(isAutoMode)
    .onBegin(() => {
      pinchStartZoom.set(rulerZoomValue.get());
      cancelAnimation(cameraZoom);
      cancelAnimation(rulerZoomValue);
      zoomGestureActive.set(true);
      scheduleOnRN(cancelNativeZoomAnimation);
    })
    .onUpdate((event) => {
      const nextZoom = Math.max(
        rulerMinZoom,
        Math.min(rulerMaxZoom, pinchStartZoom.get() * event.scale),
      );
      rulerZoomValue.set(nextZoom);
      const nextCameraZoom = getActiveCameraZoom(
        nextZoom,
        rulerMinZoom,
        rulerMaxZoom,
        minZoom,
        maxZoom,
        neutralZoom,
        usingDedicatedUltraWide,
        primaryBackHasIntegratedUltraWide,
      );
      cameraZoom.set(nextCameraZoom);
    })
    .onEnd(() => {
      zoomGestureActive.set(false);
      scheduleOnRN(finishRulerZoom, rulerZoomValue.get());
    })
    .onFinalize(() => {
      zoomGestureActive.set(false);
    });

  const zoomRulerPan = Gesture.Pan()
    .enabled(isAutoMode && cameraDevice !== undefined && rulerMaxZoom > rulerMinZoom)
    .activeOffsetX([-4, 4])
    .failOffsetY([-16, 16])
    .onBegin(() => {
      rulerDragStartZoom.set(rulerZoomValue.get());
      cancelAnimation(cameraZoom);
      cancelAnimation(rulerZoomValue);
      zoomGestureActive.set(true);
      scheduleOnRN(cancelNativeZoomAnimation);
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
      const nextCameraZoom = getActiveCameraZoom(
        nextZoom,
        rulerMinZoom,
        rulerMaxZoom,
        minZoom,
        maxZoom,
        neutralZoom,
        usingDedicatedUltraWide,
        primaryBackHasIntegratedUltraWide,
      );
      cameraZoom.set(nextCameraZoom);
    })
    .onEnd(() => {
      zoomGestureActive.set(false);
      scheduleOnRN(finishRulerZoom, rulerZoomValue.get());
    })
    .onFinalize(() => {
      zoomGestureActive.set(false);
    });

  const cameraGesture = Gesture.Simultaneous(swipe, pinch);

  const cycleFlash = () => {
    setFlash((current) => FLASH_MODES[(FLASH_MODES.indexOf(current) + 1) % FLASH_MODES.length]);
    Haptics.selectionAsync();
  };

  const focusAt = async (event: GestureResponderEvent) => {
    if (!isAutoMode || settingsVisible || modeMenuVisible) return;
    const { locationX, locationY } = event.nativeEvent;
    if (portraitEffectEnabled) {
      setPortraitTarget({
        x: clamp(locationX / previewFrame.width, 0, 1),
        y: clamp(locationY / previewFrame.height, 0, 1),
      });
    }
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
    const nextIndex = Math.max(
      0,
      Math.min(exposureSteps.length - 1, exposureStepIndex + direction),
    );
    if (nextIndex === exposureStepIndex) return;
    exposureStepPosition.set(nextIndex);
    commitDisplayedExposure(nextIndex);
    if (!meteringLocked) scheduleMeteringReset();
    void Haptics.selectionAsync();
  };

  const finishExposureDrag = (finalIndex: number) => {
    commitDisplayedExposure(finalIndex);
    if (!meteringLocked) scheduleMeteringReset();
    void Haptics.selectionAsync();
  };

  const exposureDrag = Gesture.Pan()
    .enabled(supportsExposure)
    .activeOffsetY([-4, 4])
    .failOffsetX([-18, 18])
    .onBegin(() => {
      exposureDragStartIndex.set(exposureStepPosition.get());
      exposureGestureActive.set(true);
      scheduleOnRN(cancelMeteringReset);
    })
    .onUpdate((event) => {
      const maximumIndex = Math.max(0, exposureSteps.length - 1);
      const pixelsPerStep = EXPOSURE_TRACK_HEIGHT / Math.max(1, maximumIndex);
      const nextIndex = Math.max(
        0,
        Math.min(
          maximumIndex,
          Math.round(exposureDragStartIndex.get() - event.translationY / pixelsPerStep),
        ),
      );
      exposureStepPosition.set(nextIndex);
    })
    .onFinalize(() => {
      exposureGestureActive.set(false);
      scheduleOnRN(finishExposureDrag, Math.round(exposureStepPosition.get()));
    });

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
    if (capturing) return;
    if (modeId === AUTO_CAPTURE_MODE.id) {
      setActiveCaptureModeId(AUTO_CAPTURE_MODE.id);
      setCardVisible(false);
    } else {
      const nextPresetIndex = PRESETS.findIndex((item) => item.id === modeId);
      if (nextPresetIndex >= 0) {
        setActiveCaptureModeId(PRESETS[nextPresetIndex].id);
      }
      setCardVisible(true);
    }
    setModeMenuVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const getAutomaticStarPlan = (): StarCapturePlan => resolveStarCapturePlan({
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    supportsManualExposure: false,
    supportsManualFocus: false,
    supportsManualWhiteBalance: false,
    supportsFrameStacking: Boolean(MultiFrameProcessor),
  });

  const prepareStarCapture = async (requestedPlan: StarCapturePlan) => {
    const camera = cameraRef.current;
    const controller = camera?.controller;
    if (!camera || !controller) {
      throw new Error('The camera is not ready for Star capture.');
    }

    await camera.resetFocus().catch(() => undefined);
    if (requestedPlan.strategy === 'manual-long-exposure') {
      let focusApplied = false;
      let whiteBalanceApplied = false;
      if (requestedPlan.lockFocusAtInfinity) {
        try {
          await controller.setFocusLocked(1);
          focusApplied = true;
        } catch (error) {
          console.warn('Could not lock Star focus at infinity:', error);
        }
      }
      if (requestedPlan.whiteBalanceKelvin !== undefined) {
        try {
          const gains = controller.convertWhiteBalanceTemperatureAndTintValues({
            temperature: requestedPlan.whiteBalanceKelvin,
            tint: 0,
          });
          await controller.setWhiteBalanceLocked(gains);
          whiteBalanceApplied = true;
        } catch (error) {
          console.warn('Could not lock Star white balance:', error);
        }
      }
      try {
        await controller.setExposureLocked(
          requestedPlan.exposureSeconds!,
          requestedPlan.iso!,
        );
        return {
          plan: requestedPlan,
          manualExposureApplied: true,
          focusApplied,
          whiteBalanceApplied,
          automaticMeteringApplied: false,
        };
      } catch (error) {
        console.warn('Could not apply manual Star exposure; using automatic fallback:', error);
        await camera.resetFocus().catch(() => undefined);
      }
    }

    const fallbackPlan = requestedPlan.strategy === 'manual-long-exposure'
      ? getAutomaticStarPlan()
      : requestedPlan;
    if (supportsExposure) {
      const starBias = getNativeExposureBias(
        Math.min(1, exposureMax),
        exposureMin,
        exposureMax,
        deviceExposureMin,
        deviceExposureMax,
      );
      await controller.setExposureBias(starBias).catch((error: unknown) => {
        console.warn('Could not brighten the automatic Star exposure:', error);
      });
    }
    let automaticMeteringApplied = false;
    if (meteringModes.length > 0) {
      try {
        await camera.focusTo(
          { x: previewFrame.width / 2, y: previewFrame.height / 2 },
          {
            modes: lockModes.length > 0 ? lockModes : meteringModes,
            responsiveness: 'steady',
            adaptiveness: 'locked',
            autoResetAfter: null,
          },
        );
        automaticMeteringApplied = true;
      } catch (error) {
        console.warn('Could not lock automatic Star metering:', error);
      }
    }
    return {
      plan: fallbackPlan,
      manualExposureApplied: false,
      focusApplied: false,
      whiteBalanceApplied: false,
      automaticMeteringApplied,
    };
  };

  const getAutomaticLightTrailPlan = (): LightTrailCapturePlan => resolveLightTrailCapturePlan({
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    supportsManualExposure: false,
    supportsManualWhiteBalance: false,
    supportsLightenCompositing: supportsNativeLightTrailCompositing,
  });

  const prepareLightTrailCapture = async (requestedPlan: LightTrailCapturePlan) => {
    const camera = cameraRef.current;
    const controller = camera?.controller;
    if (!camera || !controller) {
      throw new Error('The camera is not ready for Light Trail capture.');
    }

    await camera.resetFocus().catch(() => undefined);
    let automaticMeteringApplied = false;
    if (meteringModes.length > 0) {
      try {
        await camera.focusTo(
          { x: previewFrame.width / 2, y: previewFrame.height / 2 },
          {
            modes: lockModes.length > 0 ? lockModes : meteringModes,
            responsiveness: 'steady',
            adaptiveness: 'locked',
            autoResetAfter: null,
          },
        );
        automaticMeteringApplied = true;
      } catch (error) {
        console.warn('Could not lock Light Trail focus and metering:', error);
      }
    }

    if (requestedPlan.strategy === 'manual-long-exposure') {
      let whiteBalanceApplied = false;
      if (requestedPlan.whiteBalanceKelvin !== undefined) {
        try {
          const gains = controller.convertWhiteBalanceTemperatureAndTintValues({
            temperature: requestedPlan.whiteBalanceKelvin,
            tint: 0,
          });
          await controller.setWhiteBalanceLocked(gains);
          whiteBalanceApplied = true;
        } catch (error) {
          console.warn('Could not lock Light Trail white balance:', error);
        }
      }
      try {
        await controller.setExposureLocked(
          requestedPlan.exposureSeconds!,
          requestedPlan.iso!,
        );
        return {
          plan: requestedPlan,
          manualExposureApplied: true,
          focusApplied: automaticMeteringApplied,
          whiteBalanceApplied,
          automaticMeteringApplied,
        };
      } catch (error) {
        console.warn('Could not apply manual Light Trail exposure; using automatic fallback:', error);
        await camera.resetFocus().catch(() => undefined);
        automaticMeteringApplied = false;
      }
    }

    const fallbackPlan = requestedPlan.strategy === 'manual-long-exposure'
      ? getAutomaticLightTrailPlan()
      : requestedPlan;
    if (supportsExposure) {
      const highlightProtectingBias = getNativeExposureBias(
        Math.max(-1, exposureMin),
        exposureMin,
        exposureMax,
        deviceExposureMin,
        deviceExposureMax,
      );
      await controller.setExposureBias(highlightProtectingBias).catch((error: unknown) => {
        console.warn('Could not protect Light Trail highlights:', error);
      });
    }
    if (!automaticMeteringApplied && meteringModes.length > 0) {
      try {
        await camera.focusTo(
          { x: previewFrame.width / 2, y: previewFrame.height / 2 },
          {
            modes: lockModes.length > 0 ? lockModes : meteringModes,
            responsiveness: 'steady',
            adaptiveness: 'locked',
            autoResetAfter: null,
          },
        );
        automaticMeteringApplied = true;
      } catch (error) {
        console.warn('Could not lock automatic Light Trail metering:', error);
      }
    }
    return {
      plan: fallbackPlan,
      manualExposureApplied: false,
      focusApplied: automaticMeteringApplied,
      whiteBalanceApplied: false,
      automaticMeteringApplied,
    };
  };

  const getAutomaticWaterfallPlan = (): WaterfallCapturePlan => resolveWaterfallCapturePlan({
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    supportsManualExposure: false,
    supportsManualWhiteBalance: false,
    supportsTemporalAveraging: supportsNativeTemporalAveraging,
  });

  const prepareWaterfallCapture = async (requestedPlan: WaterfallCapturePlan) => {
    const camera = cameraRef.current;
    const controller = camera?.controller;
    if (!camera || !controller) {
      throw new Error('The camera is not ready for Waterfall capture.');
    }

    await camera.resetFocus().catch(() => undefined);
    let automaticMeteringApplied = false;
    if (meteringModes.length > 0) {
      try {
        await camera.focusTo(
          { x: previewFrame.width / 2, y: previewFrame.height / 2 },
          {
            modes: lockModes.length > 0 ? lockModes : meteringModes,
            responsiveness: 'steady',
            adaptiveness: 'locked',
            autoResetAfter: null,
          },
        );
        automaticMeteringApplied = true;
      } catch (error) {
        console.warn('Could not lock Waterfall focus and metering:', error);
      }
    }

    if (requestedPlan.strategy === 'manual-slow-exposure') {
      let whiteBalanceApplied = false;
      if (requestedPlan.whiteBalanceKelvin !== undefined) {
        try {
          const gains = controller.convertWhiteBalanceTemperatureAndTintValues({
            temperature: requestedPlan.whiteBalanceKelvin,
            tint: 0,
          });
          await controller.setWhiteBalanceLocked(gains);
          whiteBalanceApplied = true;
        } catch (error) {
          console.warn('Could not lock Waterfall white balance:', error);
        }
      }
      try {
        await controller.setExposureLocked(
          requestedPlan.exposureSeconds!,
          requestedPlan.iso!,
        );
        return {
          plan: requestedPlan,
          manualExposureApplied: true,
          focusApplied: automaticMeteringApplied,
          whiteBalanceApplied,
          automaticMeteringApplied,
        };
      } catch (error) {
        console.warn('Could not apply manual Waterfall exposure; using automatic fallback:', error);
        await camera.resetFocus().catch(() => undefined);
        automaticMeteringApplied = false;
      }
    }

    const fallbackPlan = requestedPlan.strategy === 'manual-slow-exposure'
      ? getAutomaticWaterfallPlan()
      : requestedPlan;
    if (supportsExposure) {
      const highlightProtectingBias = getNativeExposureBias(
        Math.max(-0.7, exposureMin),
        exposureMin,
        exposureMax,
        deviceExposureMin,
        deviceExposureMax,
      );
      await controller.setExposureBias(highlightProtectingBias).catch((error: unknown) => {
        console.warn('Could not protect Waterfall highlights:', error);
      });
    }
    if (!automaticMeteringApplied && meteringModes.length > 0) {
      try {
        await camera.focusTo(
          { x: previewFrame.width / 2, y: previewFrame.height / 2 },
          {
            modes: lockModes.length > 0 ? lockModes : meteringModes,
            responsiveness: 'steady',
            adaptiveness: 'locked',
            autoResetAfter: null,
          },
        );
        automaticMeteringApplied = true;
      } catch (error) {
        console.warn('Could not lock automatic Waterfall metering:', error);
      }
    }
    return {
      plan: fallbackPlan,
      manualExposureApplied: false,
      focusApplied: automaticMeteringApplied,
      whiteBalanceApplied: false,
      automaticMeteringApplied,
    };
  };

  const getAutomaticProductPlan = (): ProductCapturePlan => resolveProductCapturePlan({
    supportsFocusLock: false,
    supportsExposureLock: false,
    supportsWhiteBalanceLock: false,
  });

  const prepareBeautyCapture = async (requestedPlan: BeautyCapturePlan) => {
    const camera = cameraRef.current;
    const controller = camera?.controller;
    if (!camera || !controller) {
      throw new Error('The camera is not ready for Beauty capture.');
    }

    await camera.resetFocus().catch(() => undefined);
    if (supportsExposure) {
      const beautyBias = getNativeExposureBias(
        requestedPlan.exposureCompensation,
        exposureMin,
        exposureMax,
        deviceExposureMin,
        deviceExposureMax,
      );
      await controller.setExposureBias(beautyBias).catch((error: unknown) => {
        console.warn('Could not apply Beauty exposure:', error);
      });
    }

    if (meteringModes.length > 0) {
      await camera.focusTo(
        { x: previewFrame.width / 2, y: previewFrame.height / 2 },
        {
          modes: meteringModes,
          responsiveness: 'snappy',
          adaptiveness: 'continuous',
          autoResetAfter: 3,
        },
      ).catch((error: unknown) => {
        console.warn('Could not apply Beauty face-area metering:', error);
      });
    }

    return {
      plan: requestedPlan,
      manualExposureApplied: false,
      focusApplied: false,
      whiteBalanceApplied: false,
      automaticMeteringApplied: false,
    };
  };

  const prepareProductCapture = async (requestedPlan: ProductCapturePlan) => {
    const camera = cameraRef.current;
    const controller = camera?.controller;
    if (!camera || !controller) {
      throw new Error('The camera is not ready for Product capture.');
    }

    await camera.resetFocus().catch(() => undefined);
    if (supportsExposure) {
      const productBias = getNativeExposureBias(
        requestedPlan.exposureCompensation,
        exposureMin,
        exposureMax,
        deviceExposureMin,
        deviceExposureMax,
      );
      await controller.setExposureBias(productBias).catch((error: unknown) => {
        console.warn('Could not protect Product highlights:', error);
      });
    }

    const useLockedMetering = requestedPlan.strategy === 'locked-detail-capture'
      && lockModes.length > 0;
    const requestedModes = useLockedMetering ? lockModes : meteringModes;
    if (requestedModes.length > 0) {
      try {
        await camera.focusTo(
          { x: previewFrame.width / 2, y: previewFrame.height / 2 },
          {
            modes: requestedModes,
            responsiveness: 'snappy',
            adaptiveness: useLockedMetering ? 'locked' : 'continuous',
            autoResetAfter: useLockedMetering ? null : 3,
          },
        );
        return {
          plan: requestedPlan,
          manualExposureApplied: false,
          focusApplied: useLockedMetering && requestedModes.includes('AF'),
          whiteBalanceApplied: useLockedMetering && requestedModes.includes('AWB'),
          automaticMeteringApplied: useLockedMetering,
        };
      } catch (error) {
        console.warn('Could not apply locked Product metering; using automatic focus:', error);
      }
    }

    const fallbackPlan = {
      ...getAutomaticProductPlan(),
      fallbackReason: useLockedMetering
        ? 'Metering lock failed; using center-weighted automatic detail capture.'
        : requestedPlan.fallbackReason,
    };
    if (meteringModes.length > 0 && requestedModes !== meteringModes) {
      await camera.focusTo(
        { x: previewFrame.width / 2, y: previewFrame.height / 2 },
        {
          modes: meteringModes,
          responsiveness: 'snappy',
          adaptiveness: 'continuous',
          autoResetAfter: 3,
        },
      ).catch((error: unknown) => {
        console.warn('Could not apply automatic Product metering:', error);
      });
    }
    return {
      plan: fallbackPlan,
      manualExposureApplied: false,
      focusApplied: false,
      whiteBalanceApplied: false,
      automaticMeteringApplied: false,
    };
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
      // Do not let a throttled Auto exposure write overwrite mode preparation.
      if (isFlashDisabledForMode) cancelExposureUpdates();

      let appliedCapturePlan:
        | StarCapturePlan
        | LightTrailCapturePlan
        | WaterfallCapturePlan
        | BeautyCapturePlan
        | ProductCapturePlan
        | undefined;
      let manualExposureApplied = false;
      let captureFocusApplied = false;
      let captureWhiteBalanceApplied = false;
      let captureAutomaticMeteringApplied = false;
      if (isStarMode) {
        setCaptureStatus('Preparing night capture…');
        const prepared = await prepareStarCapture(starCapturePlan);
        appliedCapturePlan = prepared.plan;
        manualExposureApplied = prepared.manualExposureApplied;
        captureFocusApplied = prepared.focusApplied;
        captureWhiteBalanceApplied = prepared.whiteBalanceApplied;
        captureAutomaticMeteringApplied = prepared.automaticMeteringApplied;
      } else if (isLightTrailMode) {
        setCaptureStatus('Preparing light trails…');
        const prepared = await prepareLightTrailCapture(lightTrailCapturePlan);
        appliedCapturePlan = prepared.plan;
        manualExposureApplied = prepared.manualExposureApplied;
        captureFocusApplied = prepared.focusApplied;
        captureWhiteBalanceApplied = prepared.whiteBalanceApplied;
        captureAutomaticMeteringApplied = prepared.automaticMeteringApplied;
      } else if (isWaterfallMode) {
        setCaptureStatus('Preparing waterfall capture…');
        const prepared = await prepareWaterfallCapture(waterfallCapturePlan);
        appliedCapturePlan = prepared.plan;
        manualExposureApplied = prepared.manualExposureApplied;
        captureFocusApplied = prepared.focusApplied;
        captureWhiteBalanceApplied = prepared.whiteBalanceApplied;
        captureAutomaticMeteringApplied = prepared.automaticMeteringApplied;
      } else if (isBeautyMode) {
        setCaptureStatus('Preparing Beauty capture…');
        const prepared = await prepareBeautyCapture(beautyCapturePlan);
        appliedCapturePlan = prepared.plan;
        manualExposureApplied = prepared.manualExposureApplied;
        captureFocusApplied = prepared.focusApplied;
        captureWhiteBalanceApplied = prepared.whiteBalanceApplied;
        captureAutomaticMeteringApplied = prepared.automaticMeteringApplied;
      } else if (isProductMode) {
        setCaptureStatus('Preparing product detail…');
        const prepared = await prepareProductCapture(productCapturePlan);
        appliedCapturePlan = prepared.plan;
        manualExposureApplied = prepared.manualExposureApplied;
        captureFocusApplied = prepared.focusApplied;
        captureWhiteBalanceApplied = prepared.whiteBalanceApplied;
        captureAutomaticMeteringApplied = prepared.automaticMeteringApplied;
      }

      const plan = resolveCapturePlan(capabilities, {
        modeId: activeCaptureModeId, photoQuality: 'maximum',
        hdr: hdrEnabled, flashMode: flash, shutterSound: shutterSoundEnabled,
        portraitEffect: isAutoMode && portraitEffectEnabled,
        aspectRatio, timerSeconds, zoom: displayedZoom, exposureCompensation,
        focusExposureLocked: meteringLocked,
      });
      plan.resolved.hdr = nativeHdrRequested;
      plan.resolved.focusExposureLocked = meteringLocked || captureAutomaticMeteringApplied;
      plan.resolved.flashMode = isFlashDisabledForMode ? 'off' : cameraDevice?.hasFlash ? flash : 'off';
      if (isFlashDisabledForMode && flash !== 'off' && capabilities.flash) {
        plan.fallbacks.push({ setting: 'flashMode', requested: flash, resolved: 'off', reason: 'mode-flash-disabled' });
      }
      plan.resolved.processing = appliedCapturePlan && appliedCapturePlan.frameCount > 1
        ? isStarMode ? 'star' : isLightTrailMode ? 'light-trail' : 'waterfall' : 'single';
      plan.resolved.frameCount = appliedCapturePlan?.frameCount ?? 1;
      if (manualExposureApplied) plan.fallbacks = plan.fallbacks.filter((item) => item.setting !== 'processing');
      if (hdrEnabled && specialModeDisablesHdr && supportsNativeHdr) {
        plan.fallbacks.push({ setting: 'hdr', requested: true, resolved: false, reason: 'mode-hdr-disabled' });
      }
      const nativeSettings = readNativeCaptureSettings(cameraRef.current?.controller, Platform.OS);
      const frameCount = plan.resolved.frameCount;
      if (frameCount > 1) setMultiFrameProgress({ captured: 0, total: frameCount });
      const capturedFramePaths: string[] = [];
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        if (
          captureSessionRef.current !== captureSession
          || !cameraReadyRef.current
          || !appActiveRef.current
          || !screenFocusedRef.current
        ) return;
        if (isStarMode) {
          setCaptureStatus(
            frameCount === 1
              ? 'Capturing stars… Keep still'
              : `Capturing stars ${frameIndex + 1} of ${frameCount}… Keep still`,
          );
        } else if (isLightTrailMode) {
          setCaptureStatus(
            frameCount === 1
              ? 'Capturing light trail… Keep still'
              : `Capturing light trails ${frameIndex + 1} of ${frameCount}… Keep still`,
          );
        } else if (isWaterfallMode) {
          setCaptureStatus(
            frameCount === 1
              ? 'Smoothing waterfall… Keep still'
              : `Smoothing waterfall ${frameIndex + 1} of ${frameCount}… Keep still`,
          );
        } else if (isBeautyMode) {
          setCaptureStatus('Capturing Beauty photo… Hold steady');
        } else if (isProductMode) {
          setCaptureStatus('Capturing product detail… Hold steady');
        }
        const photoFile = await photoOutput.capturePhotoToFile(
          {
            ...getPhotoCaptureSettings(capabilities, 'maximum', nativeHdrRequested,
              plan.resolved.flashMode, shutterSoundEnabled, frameIndex),
            enableRedEyeReduction: !isFlashDisabledForMode,
            enableVirtualDeviceFusion: capabilities.virtualDeviceFusion && !isMotionCompositeMode,
          },
          {},
        );
        if (
          captureSessionRef.current !== captureSession || !cameraReadyRef.current
          || !appActiveRef.current || !screenFocusedRef.current
        ) return;
        capturedFramePaths.push(photoFile.filePath);
        if (frameCount > 1) setMultiFrameProgress({ captured: frameIndex + 1, total: frameCount });
        if (
          appliedCapturePlan?.strategy === 'automatic-lighten-composite'
          && frameIndex < frameCount - 1
        ) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, LIGHT_TRAIL_FRAME_INTERVAL_MS);
          });
        } else if (
          appliedCapturePlan?.strategy === 'automatic-temporal-average'
          && frameIndex < frameCount - 1
        ) {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, WATERFALL_FRAME_INTERVAL_MS);
          });
        }
      }

      const metadataSourceFilePath = capturedFramePaths[0];
      const outputFilePath = metadataSourceFilePath;
      const captureFallbackReason = appliedCapturePlan?.fallbackReason;
      if (
        captureSessionRef.current !== captureSession
        || !cameraReadyRef.current
        || !appActiveRef.current
        || !screenFocusedRef.current
      ) return;

      const sourcePhotoUri = `file://${outputFilePath}`;
      const captureModeName = activeCaptureModeId === AUTO_CAPTURE_MODE.id
        ? AUTO_CAPTURE_MODE.name
        : preset.name;
      const metadata: CapturePhotoMetadata = {
        ...createCaptureMetadata(plan, {
          captureMode: captureModeName, facing,
          cameraName: cameraDevice?.localizedName, cameraModel: cameraDevice?.modelID,
          cameraType: cameraDevice?.type,
          locationSaved: locationEnabled && Boolean(captureLocationRef.current),
          hdrConfirmed: nativeHdrRequested && hdrSessionConfirmed, nativeSettings,
        }),
        beautyEffectRequested: isBeautyMode,
        beautyEffectApplied: false,
        captureStrategy: appliedCapturePlan?.strategy,
        captureFrameCount: appliedCapturePlan?.frameCount,
        manualExposureApplied: appliedCapturePlan ? manualExposureApplied : undefined,
        appliedExposureSeconds: manualExposureApplied ? appliedCapturePlan?.exposureSeconds : undefined,
        appliedIso: manualExposureApplied ? appliedCapturePlan?.iso : undefined,
        appliedWhiteBalanceKelvin: captureWhiteBalanceApplied
          ? appliedCapturePlan?.whiteBalanceKelvin
          : undefined,
        whiteBalanceStrategy: captureWhiteBalanceApplied
          ? isProductMode ? 'automatic-locked' : 'manual-kelvin'
          : undefined,
        focusStrategy: appliedCapturePlan
          ? isStarMode && captureFocusApplied
            ? 'infinity-locked'
            : captureAutomaticMeteringApplied ? 'automatic-locked' : undefined
          : undefined,
        processingOperations: undefined,
        captureFallbackReason,
      };
      latestCaptureRef.current = captureSession;
      setLatestPhoto({
        key: `${captureSession}-${sourcePhotoUri}`,
        uri: sourcePhotoUri,
      });
      setCapturing(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      enqueuePhotoSave(
        capturedFramePaths,
        aspectRatio,
        width / height,
        captureSession,
        plan.resolved.jpegQuality,
        metadata,
        locationEnabled ? captureLocationRef.current : undefined,
        isBeautyMode ? 'beauty' : isAutoMode && portraitEffectEnabled ? 'portrait' : undefined,
        metadataSourceFilePath,
        portraitTarget,
        plan.resolved.processing === 'single' ? undefined : plan.resolved.processing,
      );
    } catch (error) {
      if (captureSessionRef.current === captureSession) {
        Alert.alert('Capture failed', String(error));
      }
    } finally {
      if (captureSessionRef.current === captureSession) {
        countdownActiveRef.current = false;
        setCountdown(undefined);
        setCaptureStatus(undefined);
        setMultiFrameProgress(undefined);
        setCapturing(false);
        if (isLongCaptureMode || isBeautyMode || isProductMode) {
          void cameraRef.current?.resetFocus().catch(() => undefined);
          const controller = cameraRef.current?.controller;
          if (supportsExposure && controller) {
            void controller.setExposureBias(nativeExposureBias).catch(() => undefined);
          }
        }
      }
    }
  };

  const captureCanBeCancelled = countdown !== undefined || multiFrameProgress !== undefined
    || (capturing && isLongCaptureMode && captureStatus !== undefined);

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
              zoom={cameraZoomProp}
              mirrorMode="auto"
              orientationSource="device"
              resizeMode="cover"
              implementationMode={isAutoMode && portraitEffectEnabled ? 'compatible' : 'performance'}
              onSessionConfigSelected={(config) => {
                setHdrSessionConfirmed(
                  nativeHdrRequested && config.isPhotoHDREnabled,
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
                setHdrSessionConfirmed(false);
                cameraReadyRef.current = false;
                setCameraReady(false);
                cancelPendingCapture();
              }}
              onStopped={() => {
                setHdrSessionConfirmed(false);
                cameraReadyRef.current = false;
                setCameraReady(false);
                cancelPendingCapture();
              }}
              onError={(error) => {
                if (isCameraLifecycleCancellation(error)) return;

                cameraReadyRef.current = false;
                setCameraReady(false);
                cancelPendingCapture();
                setHdrSessionConfirmed(false);
                Alert.alert('Camera unavailable', getCameraErrorMessage(error));
              }}
            />
          )}

          {Platform.OS === 'android' && appActive && screenFocused && !capturing && cameraDevice && cameraReady && isAutoMode && portraitEffectEnabled && (
            <Suspense fallback={null}>
              <PortraitPreviewBlur
                width={previewFrame.width}
                height={previewFrame.height}
                focusX={portraitTarget.x}
                focusY={portraitTarget.y}
                sceneKey={`${cameraDevice.id}:${aspectRatio}:${displayedZoom.toFixed(1)}`}
                getSnapshot={getPortraitSnapshot}
              />
            </Suspense>
          )}

          {isAutoMode && (
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

        {captureStatus && countdown === undefined && (
          <View
            accessible
            accessibilityLabel={captureStatus}
            accessibilityLiveRegion="polite"
            pointerEvents="none"
            style={[styles.captureStatus, { bottom: insets.bottom + 160 }]}>
            <Ionicons name={preset.icon} size={16} color={preset.tint} />
            <Text style={styles.captureStatusText}>{captureStatus}</Text>
          </View>
        )}

        {isAutoMode && focusPoint && (
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
              accessibilityLabel={`Focus point. Exposure ${exposureCompensation > 0 ? 'plus ' : ''}${exposureLabel} EV. ${meteringLocked ? 'Locked' : 'Automatic reset enabled'}`}
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
                  now: activeExposureStep.displayValue,
                  text: `${activeExposureStep.displayValue > 0 ? 'plus ' : ''}${exposureLabel} EV`,
                }}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === 'increment') changeExposure(1);
                  if (event.nativeEvent.actionName === 'decrement') changeExposure(-1);
                }}
                style={styles.exposureControl}>
                <View style={styles.exposureTrack}>
                  <View style={styles.exposureTrackLine} />
                  <View style={[styles.exposureTrackZero, { top: exposureZeroTop }]} />
                  <Animated.View style={[styles.exposureThumb, exposureThumbAnimatedStyle]} />
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

        {!isAutoMode && cardVisible && (
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
              <Text style={styles.cardStatusLabel}>
                {isLongCaptureMode || isBeautyMode || isProductMode
                  ? 'CAPTURE PLAN'
                  : 'SUGGESTED STARTING POINT'}
              </Text>
              <View style={styles.chips}>
                {isStarMode ? (
                  <>
                    <Text style={styles.chip}>{getStarPlanLabel(starCapturePlan)}</Text>
                    {starCapturePlan.exposureSeconds !== undefined && (
                      <Text style={styles.chip}>{starCapturePlan.exposureSeconds.toFixed(1)}s</Text>
                    )}
                    {starCapturePlan.iso !== undefined && (
                      <Text style={styles.chip}>ISO {starCapturePlan.iso}</Text>
                    )}
                    <Text style={styles.chip}>Flash off</Text>
                  </>
                ) : isLightTrailMode ? (
                  <>
                    <Text style={styles.chip}>{getLightTrailPlanLabel(lightTrailCapturePlan)}</Text>
                    {lightTrailCapturePlan.exposureSeconds !== undefined && (
                      <Text style={styles.chip}>{lightTrailCapturePlan.exposureSeconds.toFixed(1)}s</Text>
                    )}
                    {lightTrailCapturePlan.iso !== undefined && (
                      <Text style={styles.chip}>ISO {lightTrailCapturePlan.iso}</Text>
                    )}
                    <Text style={styles.chip}>Flash off</Text>
                  </>
                ) : isWaterfallMode ? (
                  <>
                    <Text style={styles.chip}>{getWaterfallPlanLabel(waterfallCapturePlan)}</Text>
                    {waterfallCapturePlan.exposureSeconds !== undefined && (
                      <Text style={styles.chip}>{waterfallCapturePlan.exposureSeconds.toFixed(2)}s</Text>
                    )}
                    {waterfallCapturePlan.iso !== undefined && (
                      <Text style={styles.chip}>ISO {waterfallCapturePlan.iso}</Text>
                    )}
                    <Text style={styles.chip}>Flash off</Text>
                  </>
                ) : isBeautyMode ? (
                  <>
                    <Text style={styles.chip}>Natural retouch</Text>
                    <Text style={styles.chip}>Skin smoothing</Text>
                    <Text style={styles.chip}>Detail preserved</Text>
                    <Text style={styles.chip}>Flash off</Text>
                  </>
                ) : isProductMode ? (
                  <>
                    <Text style={styles.chip}>{getProductPlanLabel(productCapturePlan)}</Text>
                    <Text style={styles.chip}>Center focus</Text>
                    <Text style={styles.chip}>
                      {productCapturePlan.exposureCompensation.toFixed(1)} EV
                    </Text>
                    <Text style={styles.chip}>
                      {productCapturePlan.lockWhiteBalance ? 'WB lock' : 'Auto WB'}
                    </Text>
                    <Text style={styles.chip}>Flash off</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.chip}>ISO {preset.iso}</Text>
                    <Text style={styles.chip}>{preset.shutter}</Text>
                    <Text style={styles.chip}>{preset.whiteBalance}K</Text>
                    {preset.raw && <Text style={styles.chip}>RAW</Text>}
                  </>
                )}
              </View>
              <View style={styles.tipRow}>
                <Ionicons name="information-circle-outline" size={13} color={preset.tint} />
                <Text style={[styles.tip, { color: preset.tint }]}>
                  {isStarMode
                    ? starCapturePlan.guidance
                    : isLightTrailMode
                      ? lightTrailCapturePlan.guidance
                      : isWaterfallMode
                        ? waterfallCapturePlan.guidance
                        : isBeautyMode
                          ? beautyCapturePlan.guidance
                          : isProductMode ? productCapturePlan.guidance : preset.tip}
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        )}

        {!isAutoMode && !cardVisible && (
          <Pressable
            style={[styles.pill, { top: insets.top + 16 }]}
            onPress={() => setCardVisible(true)}>
            <Ionicons name={preset.icon} size={14} color={preset.tint} />
            <Text style={styles.pillText}>{preset.name}</Text>
          </Pressable>
        )}

        <Pressable
          accessibilityLabel="Camera settings"
          accessibilityHint="Change photo location, gridlines, aspect ratio, timer, shutter sound, and HDR"
          accessibilityRole="button"
          accessibilityState={{ disabled: capturing }}
          disabled={capturing}
          onPress={() => {
            setModeMenuVisible(false);
            setSettingsVisible((visible) => !visible);
          }}
          style={[styles.settingsButton, capturing && styles.controlDisabled, { top: insets.top + 16 }]}>
          <Ionicons name="ellipsis-horizontal" size={24} color="white" />
        </Pressable>

        {isAutoMode && (
          <View style={[styles.autoTopControls, { top: insets.top + 16 }]}>
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
              accessibilityHint="Detects subject outlines and blurs the background. Tap a person, pet, or object to select it. Live preview is available on Android."
              accessibilityLabel="Portrait effect"
              accessibilityRole="switch"
              accessibilityState={{ checked: portraitEffectEnabled, busy: portraitPreparing, disabled: capturing }}
              disabled={capturing}
              onPress={async () => {
                if (portraitEffectEnabled || portraitPreparing) {
                  portraitPreparation.current += 1;
                  setPortraitPreparing(false);
                  setPortraitEffectEnabled(false);
                  setCaptureStatus(undefined);
                  return;
                }
                if (PortraitEffect?.subjectSegmentationVersion !== 2
                  || (Platform.OS === 'android' && (!requireOptionalNativeModule('ExpoBlurView')
                    || !UIManager.getViewManagerConfig('RNCMaskedView')))) {
                  Alert.alert(
                    'Rebuild required',
                    'Live Portrait preview and photo processing use native modules. Rebuild and reinstall IntelliCam to enable them.',
                  );
                  return;
                }
                const preparation = ++portraitPreparation.current;
                setPortraitPreparing(true);
                setCaptureStatus('Preparing Portrait subject detection…');
                try {
                  const available = await PortraitEffect.prepareAsync();
                  if (preparation !== portraitPreparation.current) return;
                  if (!available) throw new Error('Object-aware Portrait requires iOS 17 or later.');
                  setPortraitEffectEnabled(true);
                  void Haptics.selectionAsync();
                  if (Platform.OS === 'ios') {
                    Alert.alert('Portrait photos', 'Subject-aware blur will be applied to saved photos. Live Portrait preview is currently available on Android only.');
                  }
                } catch (error) {
                  if (preparation === portraitPreparation.current) {
                    Alert.alert('Portrait unavailable', Platform.OS === 'android'
                      ? 'The subject-detection model could not be prepared. Check your internet connection and Google Play services, then try again.'
                      : String(error));
                  }
                } finally {
                  if (preparation === portraitPreparation.current) {
                    setPortraitPreparing(false);
                    setCaptureStatus(undefined);
                  }
                }
              }}
              style={[
                styles.roundControl,
                portraitEffectEnabled && styles.roundControlActive,
                capturing && styles.controlDisabled,
              ]}>
              <Ionicons
                name="aperture-outline"
                size={21}
                color={portraitEffectEnabled ? '#FFD400' : 'white'}
              />
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

        {!isAutoMode && <View style={[styles.dots, { bottom: insets.bottom + 124 }]}>
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

        {isAutoMode && (
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
            accessibilityState={{ disabled: capturing }}
            disabled={capturing}
            onPress={() => router.push('/gallery' as Href)}
            style={[styles.secondaryControl, capturing && styles.controlDisabled]}>
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
            accessibilityLabel={captureCanBeCancelled ? 'Cancel photo capture' : 'Take picture'}
            accessibilityHint={captureCanBeCancelled ? 'Stops the active capture without saving another photo' : undefined}
            accessibilityRole="button"
            accessibilityState={{ disabled: !cameraReady || portraitPreparing || (capturing && !captureCanBeCancelled) }}
            style={[
              styles.shutter,
              captureCanBeCancelled && styles.shutterCancelling,
              (portraitPreparing || (capturing && !captureCanBeCancelled)) && styles.shutterDisabled,
            ]}
            disabled={!cameraReady || portraitPreparing || (capturing && !captureCanBeCancelled)}
            onPress={captureCanBeCancelled ? () => cancelPendingCapture(true) : capture}>
            <View
              style={[
                styles.shutterInner,
                { borderColor: preset.tint },
                captureCanBeCancelled && styles.shutterInnerCancelling,
              ]}>
              {captureCanBeCancelled && <Ionicons name="close" size={30} color="white" />}
            </View>
          </Pressable>

          <Pressable
            accessibilityLabel="Change capture mode"
            accessibilityHint="Opens the swipeable capture mode selector"
            accessibilityRole="button"
            accessibilityState={{ disabled: capturing }}
            disabled={capturing}
            onPress={() => {
              setSettingsVisible(false);
              setModeMenuVisible(true);
            }}
            style={[styles.secondaryControl, capturing && styles.controlDisabled]}>
            <View style={styles.modeControlIcon}>
              <Ionicons
                name="albums-outline"
                size={25}
                color="white"
                style={styles.modeControlCards}
              />
              <Ionicons
                name="sparkles"
                size={12}
                color="#9FE1CB"
                style={styles.modeControlSparkle}
              />
              <View style={styles.modeControlStatus} />
            </View>
            <Text style={styles.controlLabel}>{isAutoMode ? 'Auto' : preset.name.replace(' photography', '')}</Text>
          </Pressable>
        </View>

        <CaptureModeCarousel
          visible={modeMenuVisible}
          selectedId={activeCaptureModeId}
          onClose={() => setModeMenuVisible(false)}
          onApply={applyCaptureMode}
        />

        {settingsVisible && (
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(120)}
            style={[styles.settingsSheet, { top: insets.top + 68, width: Math.min(310, width - 36) }]}>
            <ScrollView
              contentContainerStyle={styles.settingsContent}
              showsVerticalScrollIndicator={false}>
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
                  : 'HDR is unavailable on this camera'}
                accessibilityRole="switch"
                accessibilityState={{
                  busy: nativeHdrRequested && !hdrSessionConfirmed,
                  checked: nativeHdrRequested,
                  disabled: !supportsNativeHdr,
                }}
                disabled={!supportsNativeHdr}
                onPress={() => {
                  if (!supportsNativeHdr) return;
                  cameraReadyRef.current = false;
                  setCameraReady(false);
                  setHdrSessionConfirmed(false);
                  setHdrEnabled((enabled) => !enabled);
                  void Haptics.selectionAsync();
                }}
                style={({ pressed }) => [
                  styles.iconSettingButton,
                  nativeHdrRequested && styles.iconSettingButtonActive,
                  !supportsNativeHdr && styles.iconSettingButtonDisabled,
                  pressed && supportsNativeHdr && styles.iconSettingButtonPressed,
                ]}>
                <View style={[styles.hdrBadge, nativeHdrRequested && styles.hdrBadgeActive]}>
                  <Text
                    allowFontScaling={false}
                    style={[styles.hdrBadgeText, nativeHdrRequested && styles.hdrBadgeTextActive]}>
                    HDR
                  </Text>
                </View>
                {!supportsNativeHdr && <Text style={styles.hdrUnavailableText}>Unavailable</Text>}
              </Pressable>
              <Pressable
                accessibilityLabel="Photo location"
                accessibilityHint={locationEnabled
                  ? captureLocation
                    ? 'Coordinates are ready for new photos. Tap to stop saving location.'
                    : 'Finding your location for new photos. Tap to stop saving location.'
                  : 'Off for privacy. Tap to save coordinates in new photos; location permission may be requested.'}
                accessibilityRole="switch"
                accessibilityState={{ checked: locationEnabled, busy: locationEnabled && !captureLocation }}
                onPress={() => void toggleLocationMetadata()}
                style={({ pressed }) => [
                  styles.iconSettingButton,
                  locationEnabled && styles.iconSettingButtonActive,
                  pressed && styles.iconSettingButtonPressed,
                ]}>
                <Ionicons
                  name={locationEnabled ? 'location' : 'location-outline'}
                  size={25}
                  color={locationEnabled ? '#FFD400' : 'white'}
                />
              </Pressable>
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingHeading}>
                <Ionicons name="scan-outline" size={18} color="#bbb" />
                <Text style={styles.settingLabel}>Aspect ratio</Text>
              </View>
              <View style={styles.segmented}>
                {CAMERA_ASPECT_RATIOS.map((ratio) => (
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
                {CAMERA_TIMER_SECONDS.map((seconds) => (
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
            </ScrollView>
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
  cardStatusLabel: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.52)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.9,
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
  autoTopControls: {
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
  roundControlActive: {
    backgroundColor: 'rgba(255,212,0,0.16)',
    borderColor: 'rgba(255,212,0,0.72)',
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
    gap: 4,
  },
  zoomReadout: {
    minWidth: 48,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: 'rgba(12,12,12,0.88)',
  },
  zoomReadoutText: {
    width: 38,
    padding: 0,
    color: '#FFD400',
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  zoomRuler: {
    position: 'relative',
    height: 44,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(12,12,12,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  zoomRulerTicks: {
    position: 'absolute',
    left: 0,
    top: 2,
    height: 38,
  },
  zoomRulerTickTrack: {
    position: 'absolute',
    left: ZOOM_RULER_LABEL_WIDTH / 2,
    top: 0,
    height: 38,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  zoomRulerTickSlot: {
    width: ZOOM_RULER_TICK_SPACING,
    height: 38,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  zoomRulerLabel: {
    color: 'rgba(255,255,255,0.96)',
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  zoomRulerLabelButton: {
    position: 'absolute',
    top: 0,
    width: ZOOM_RULER_LABEL_WIDTH,
    height: 44,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 1,
  },
  zoomRulerLabelButtonPressed: {
    opacity: 0.55,
    transform: [{ scale: 0.97 }],
  },
  zoomRulerTick: {
    width: 1,
    height: 7,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  zoomRulerTickMedium: {
    height: 11,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  zoomRulerTickMajor: {
    width: 2,
    height: 16,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  zoomRulerIndicator: {
    position: 'absolute',
    top: 18,
    bottom: 4,
    left: '50%',
    width: 2,
    marginLeft: -1,
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
  modeControlIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: '#9FE1CB',
    backgroundColor: 'rgba(20,20,20,0.72)',
  },
  modeControlCards: {
    transform: [{ translateX: -2 }, { translateY: 2 }],
  },
  modeControlSparkle: {
    position: 'absolute',
    top: 7,
    right: 7,
  },
  modeControlStatus: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#080808',
    backgroundColor: '#9FE1CB',
  },
  thumbnailFrame: {
    width: 46,
    height: 46,
    overflow: 'hidden',
    borderRadius: 23,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: '#222',
  },
  thumbnailPlaceholder: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(20,20,20,0.7)',
  },
  controlLabel: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  controlDisabled: {
    opacity: 0.45,
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
    borderRadius: 20,
    backgroundColor: 'rgba(20,20,20,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  settingsContent: {
    gap: 14,
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
  captureStatus: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '82%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(10,10,10,0.84)',
    borderWidth: 1,
    borderColor: 'rgba(159,225,203,0.42)',
  },
  captureStatusText: {
    flexShrink: 1,
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
    borderRadius: 38,
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
    top: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFD84D',
    borderWidth: 1,
    borderColor: 'white',
  },
  meteringLock: {
    position: 'absolute',
    left: 16,
    top: 54,
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
  iconSettingButtonDisabled: {
    opacity: 0.46,
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
  hdrUnavailableText: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
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
