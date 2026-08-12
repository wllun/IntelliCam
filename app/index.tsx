import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';
import {
  Camera,
  type CameraRef,
  type Constraint,
  type DeviceFilter,
  type FlashMode,
  type MeteringMode,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useSharedValue,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';

import { PRESETS } from '@/constants/presets';
import { CaptureModeCarousel } from '@/components/capture-mode-carousel';

const ALBUM_NAME = 'IntelliCam';
type CaptureMode = 'normal' | 'preset';
type TimerSeconds = 0 | 3 | 10;
type CameraFacing = 'front' | 'back';
type CameraRatio = '4:3' | '1:1' | '16:9';

const FLASH_MODES: FlashMode[] = ['off', 'auto', 'on'];
const ASPECT_RATIOS: CameraRatio[] = ['4:3', '1:1', '16:9'];
const TIMER_OPTIONS: TimerSeconds[] = [0, 3, 10];
const METERING_RESET_MS = 5000;
const EXPOSURE_MIN = -2;
const EXPOSURE_MAX = 2;
const EXPOSURE_STEP = 0.3;
const EXPOSURE_DRAG_PIXELS_PER_EV = 42;
const EXPOSURE_TRACK_HEIGHT = 42;
const QUICK_ZOOM_LEVELS = [0.5, 1, 2, 3] as const;
const ZOOM_TRANSITION_MS = 180;
const BACK_CAMERA_FILTER = {
  physicalDevices: ['ultra-wide-angle', 'wide-angle', 'telephoto'],
} satisfies DeviceFilter;

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

function getRatioValue(ratio: CameraRatio, landscape: boolean) {
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
  const targetRatio = getRatioValue(ratio, landscape);
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
) {
  const landscape = sourceWidth >= sourceHeight;
  const targetRatio = getRatioValue(ratio, landscape);
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
  const cameraDevice = useCameraDevice(facing, facing === 'back' ? BACK_CAMERA_FILTER : undefined);
  const photoOutput = usePhotoOutput({
    containerFormat: 'jpeg',
    quality: 1,
    qualityPrioritization: 'quality',
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
  const [zoom, setZoom] = useState(1);
  const [gridLines, setGridLines] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<CameraRatio>('4:3');
  const [timerSeconds, setTimerSeconds] = useState<TimerSeconds>(0);
  const [shutterSoundEnabled, setShutterSoundEnabled] = useState(false);
  const [hdrEnabled, setHdrEnabled] = useState(false);
  const [hdrApplied, setHdrApplied] = useState(false);
  const [countdown, setCountdown] = useState<number>();
  const [focusPoint, setFocusPoint] = useState<FocusPoint>();
  const [exposureCompensation, setExposureCompensation] = useState(0);
  const [meteringLocked, setMeteringLocked] = useState(false);
  const meteringResetRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const zoomAnimationRef = useRef<number | undefined>(undefined);
  const countdownTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const countdownResolveRef = useRef<(() => void) | undefined>(undefined);
  const countdownActiveRef = useRef(false);
  const captureSessionRef = useRef(0);
  const appActiveRef = useRef(AppState.currentState === 'active');
  const screenFocusedRef = useRef(true);
  const cameraReadyRef = useRef(false);
  const pinchStartZoom = useSharedValue(0);
  const exposureDragStart = useSharedValue(0);

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

  const cancelZoomAnimation = useCallback(() => {
    if (zoomAnimationRef.current !== undefined) {
      cancelAnimationFrame(zoomAnimationRef.current);
      zoomAnimationRef.current = undefined;
    }
  }, []);

  const animateZoomTo = useCallback((target: number) => {
    cancelZoomAnimation();
    const cameraMinZoom = cameraDevice?.minZoom ?? 1;
    const cameraMaxZoom = cameraDevice?.maxZoom ?? cameraMinZoom;
    const clampedTarget = Math.max(cameraMinZoom, Math.min(cameraMaxZoom, target));
    const startedAt = Date.now();
    const startZoom = zoom;

    const step = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / ZOOM_TRANSITION_MS);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setZoom(startZoom + (clampedTarget - startZoom) * easedProgress);
      if (progress < 1) {
        zoomAnimationRef.current = requestAnimationFrame(step);
      } else {
        zoomAnimationRef.current = undefined;
      }
    };

    zoomAnimationRef.current = requestAnimationFrame(step);
  }, [cameraDevice, cancelZoomAnimation, zoom]);

  useEffect(() => cancelZoomAnimation, [cancelZoomAnimation]);

  useEffect(() => {
    resetMetering();
  }, [captureMode, facing, resetMetering]);

  useEffect(() => {
    cameraReadyRef.current = false;
    setCameraReady(false);
    cancelPendingCapture();
    cancelZoomAnimation();
    setZoom(1);
  }, [cameraDevice?.id, cancelPendingCapture, cancelZoomAnimation, facing]);

  const hasMediaPermission = mediaPermission?.granted ?? false;
  const preset = PRESETS[presetIndex];
  const isNormalMode = captureMode === 'normal';
  const neutralZoom = 1;
  const minZoom = cameraDevice?.minZoom ?? neutralZoom;
  const maxZoom = cameraDevice?.maxZoom ?? neutralZoom;
  const supportsUltraWide = minZoom < neutralZoom - 0.01;
  const supportsExposure = cameraDevice?.supportsExposureBias ?? false;
  const exposureMin = supportsExposure
    ? Math.max(EXPOSURE_MIN, cameraDevice?.minExposureBias ?? EXPOSURE_MIN)
    : 0;
  const exposureMax = supportsExposure
    ? Math.min(EXPOSURE_MAX, cameraDevice?.maxExposureBias ?? EXPOSURE_MAX)
    : 0;
  const supportsHdr = cameraDevice?.supportsPhotoHDR ?? false;
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
    const modes: MeteringMode[] = [];
    if (cameraDevice.supportsExposureMetering && cameraDevice.supportsExposureLocking) modes.push('AE');
    if (cameraDevice.supportsFocusMetering && cameraDevice.supportsFocusLocking) modes.push('AF');
    if (cameraDevice.supportsWhiteBalanceMetering && cameraDevice.supportsWhiteBalanceLocking) modes.push('AWB');
    return modes;
  }, [cameraDevice]);
  const cameraOutputs = useMemo(() => [photoOutput], [photoOutput]);
  const cameraConstraints = useMemo<Constraint[]>(() => [
    { photoHDR: hdrEnabled && supportsHdr },
    { resolutionBias: photoOutput },
  ], [hdrEnabled, photoOutput, supportsHdr]);
  const isLandscapeCapture = width > height;
  const previewFrame = getPreviewFrame(
    width,
    height,
    aspectRatio,
    isLandscapeCapture,
  );

  useEffect(() => {
    setExposureCompensation((current) => Math.max(exposureMin, Math.min(exposureMax, current)));
  }, [exposureMax, exposureMin]);

  useEffect(() => {
    if (!supportsHdr) {
      setHdrEnabled(false);
      setHdrApplied(false);
    }
  }, [supportsHdr]);

  const changePreset = (direction: 1 | -1) => {
    setPresetIndex((i) => (i + direction + PRESETS.length) % PRESETS.length);
    setCardVisible(true);
    Haptics.selectionAsync();
  };

  const updateZoomFromPinch = (nextZoom: number) => {
    setZoom(Math.max(minZoom, Math.min(maxZoom, nextZoom)));
  };

  const selectQuickZoom = (level: (typeof QUICK_ZOOM_LEVELS)[number]) => {
    const targetZoom = neutralZoom * level;
    if (targetZoom < minZoom - 0.01 || targetZoom > maxZoom + 0.01) return;
    animateZoomTo(targetZoom);
    Haptics.selectionAsync();
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
      pinchStartZoom.value = zoom;
      runOnJS(cancelZoomAnimation)();
    })
    .onUpdate((event) => {
      runOnJS(updateZoomFromPinch)(pinchStartZoom.value * event.scale);
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

      const photo = await photoOutput.capturePhoto(
        {
          flashMode: cameraDevice?.hasFlash ? flash : 'off',
          enableShutterSound: shutterSoundEnabled,
        },
        {},
      );
      let savedPhotoUri: string;
      try {
        const normalizedImage = await photo.toImageAsync();
        try {
          const crop = getCenteredCrop(normalizedImage.width, normalizedImage.height, aspectRatio);
          if (crop) {
            const croppedImage = normalizedImage.crop(
              crop.originX,
              crop.originY,
              crop.originX + crop.width,
              crop.originY + crop.height,
            );
            try {
              savedPhotoUri = `file://${await croppedImage.saveToTemporaryFileAsync('jpg', 100)}`;
            } finally {
              croppedImage.dispose();
            }
          } else {
            savedPhotoUri = `file://${await normalizedImage.saveToTemporaryFileAsync('jpg', 100)}`;
          }
        } finally {
          normalizedImage.dispose();
        }
      } finally {
        photo.dispose();
      }
      if (
        captureSessionRef.current !== captureSession
        || !appActiveRef.current
        || !screenFocusedRef.current
      ) return;

      const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
      if (!album) {
        await MediaLibrary.createAlbumAsync(ALBUM_NAME, undefined, false, savedPhotoUri);
      } else {
        await MediaLibrary.createAssetAsync(savedPhotoUri, album);
      }
      setLatestPhoto({
        key: `${Date.now()}-${savedPhotoUri}`,
        uri: savedPhotoUri,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
              exposure={supportsExposure ? exposureCompensation : undefined}
              zoom={zoom}
              mirrorMode="auto"
              orientationSource="device"
              resizeMode="cover"
              onSessionConfigSelected={(config) => {
                setHdrApplied(config.isPhotoHDREnabled);
              }}
              onConfigured={() => {
                if (appActiveRef.current && screenFocusedRef.current) {
                  cameraReadyRef.current = true;
                  setCameraReady(true);
                }
              }}
              onStarted={() => {
                if (appActiveRef.current && screenFocusedRef.current) {
                  cameraReadyRef.current = true;
                  setCameraReady(true);
                }
              }}
              onStopped={() => {
                cameraReadyRef.current = false;
                setCameraReady(false);
              }}
              onError={(error) => {
                cameraReadyRef.current = false;
                setCameraReady(false);
                cancelPendingCapture();
                if (facing === 'back') {
                  setFacing('front');
                } else {
                  Alert.alert('Camera unavailable', error.message);
                }
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
                <Ionicons name="sunny-outline" size={17} color="white" />
                <View style={styles.exposureTrack}>
                  <View style={styles.exposureTrackLine} />
                  <View style={[styles.exposureThumb, { top: exposureThumbTop - 5 }]} />
                </View>
                <Text style={styles.exposureValue}>
                  {exposureCompensation > 0 ? '+' : ''}
                  {exposureCompensation.toFixed(1)}
                </Text>
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
            <View style={styles.zoomReadout}>
              <Text style={styles.zoomReadoutText}>
                {(zoom / neutralZoom).toFixed(1)}× relative zoom
              </Text>
            </View>
            <View style={styles.zoomControls}>
              {QUICK_ZOOM_LEVELS.map((level) => {
                const targetZoom = neutralZoom * level;
                const unavailable = (level === 0.5 && !supportsUltraWide)
                  || targetZoom < minZoom - 0.01
                  || targetZoom > maxZoom + 0.01;
                const active = Math.abs(zoom - targetZoom) < 0.03;

                return (
                  <Pressable
                    key={level}
                    accessibilityLabel={`${level} times zoom`}
                    accessibilityHint={unavailable ? 'Ultrawide lens is not available on this device' : undefined}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: unavailable, selected: active }}
                    disabled={unavailable}
                    onPress={() => selectQuickZoom(level)}
                    style={({ pressed }) => [
                      styles.zoomButton,
                      active && styles.zoomButtonActive,
                      pressed && !unavailable && styles.zoomButtonPressed,
                      unavailable && styles.zoomButtonDisabled,
                    ]}>
                    <Text
                      style={[
                        styles.zoomText,
                        active && styles.zoomTextActive,
                        unavailable && styles.zoomTextDisabled,
                      ]}>
                      {level}×
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.pinchHint}>Pinch anywhere to zoom</Text>
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
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: gridLines }}
              onPress={() => setGridLines((enabled) => !enabled)}
              style={styles.toggleRow}>
              <View style={styles.settingIcon}>
                <Ionicons name="grid-outline" size={20} color="white" />
              </View>
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Gridlines</Text>
                <Text style={styles.settingsDescription}>Rule-of-thirds composition guide</Text>
              </View>
              <View style={[styles.switchTrack, gridLines && styles.switchTrackActive]}>
                <View style={[styles.switchThumb, gridLines && styles.switchThumbActive]} />
              </View>
            </Pressable>

            <View style={styles.settingRow}>
              <View style={styles.settingHeading}>
                <Ionicons name="scan-outline" size={18} color="#bbb" />
                <Text style={styles.settingLabel}>Aspect ratio</Text>
              </View>
              <View style={styles.segmented}>
                {ASPECT_RATIOS.map((ratio) => (
                  <Pressable
                    key={ratio}
                    onPress={() => {
                      setAspectRatio(ratio);
                      Haptics.selectionAsync();
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
                    onPress={() => {
                      setTimerSeconds(seconds);
                      Haptics.selectionAsync();
                    }}
                    style={[styles.segment, timerSeconds === seconds && styles.segmentActive]}>
                    <Text style={[styles.segmentText, timerSeconds === seconds && styles.segmentTextActive]}>
                      {seconds === 0 ? 'Off' : `${seconds}s`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: shutterSoundEnabled }}
              onPress={() => {
                setShutterSoundEnabled((enabled) => !enabled);
                Haptics.selectionAsync();
              }}
              style={styles.toggleRow}>
              <View style={styles.settingIcon}>
                <Ionicons name="volume-high-outline" size={20} color="white" />
              </View>
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Shutter sound</Text>
                <Text style={styles.settingsDescription}>Play a sound when taking a photo</Text>
              </View>
              <View
                style={[
                  styles.switchTrack,
                  shutterSoundEnabled && styles.switchTrackActive,
                ]}>
                <View
                  style={[
                    styles.switchThumb,
                    shutterSoundEnabled && styles.switchThumbActive,
                  ]}
                />
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: hdrApplied, disabled: !supportsHdr }}
              disabled={!supportsHdr}
              onPress={() => {
                cameraReadyRef.current = false;
                setCameraReady(false);
                setHdrApplied(false);
                setHdrEnabled((enabled) => !enabled);
                void Haptics.selectionAsync();
              }}
              style={[styles.toggleRow, !supportsHdr && styles.toggleRowDisabled]}>
              <View style={styles.settingIcon}>
                <Ionicons name="contrast-outline" size={20} color="white" />
              </View>
              <View style={styles.settingCopy}>
                <View style={styles.hdrTitleRow}>
                  <Text style={styles.settingTitle}>HDR</Text>
                  {supportsHdr && (
                    <Text style={styles.plannedBadge}>{hdrApplied ? 'ACTIVE' : 'SUPPORTED'}</Text>
                  )}
                </View>
                <Text style={styles.settingsDescription}>
                  {supportsHdr
                    ? hdrEnabled
                      ? hdrApplied
                        ? 'Multi-frame HDR capture is active'
                        : 'Configuring multi-frame HDR capture'
                      : 'Preserve detail in highlights and shadows'
                    : 'Not supported by this camera'}
                </Text>
              </View>
              <View style={[styles.switchTrack, hdrApplied && styles.switchTrackActive]}>
                <View style={[styles.switchThumb, hdrApplied && styles.switchThumbActive]} />
              </View>
            </Pressable>
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
    gap: 5,
  },
  zoomReadout: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(20,20,20,0.65)',
  },
  zoomReadoutText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  zoomControls: {
    flexDirection: 'row',
    gap: 8,
    padding: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(20,20,20,0.65)',
  },
  zoomButton: {
    minWidth: 48,
    height: 48,
    paddingHorizontal: 7,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomButtonActive: {
    backgroundColor: 'white',
  },
  zoomButtonPressed: {
    opacity: 0.72,
  },
  zoomText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  zoomTextActive: {
    color: '#111',
  },
  zoomButtonDisabled: {
    opacity: 0.38,
  },
  zoomTextDisabled: {
    color: 'rgba(255,255,255,0.7)',
  },
  pinchHint: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 9,
    fontWeight: '600',
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
    width: 42,
    height: 112,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderRadius: 21,
    backgroundColor: 'rgba(16,16,16,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
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
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  exposureThumb: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFD84D',
    borderWidth: 1,
    borderColor: 'white',
  },
  exposureValue: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
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
  settingsDescription: {
    color: '#aaa',
    fontSize: 12,
    lineHeight: 16,
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
  toggleRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  toggleRowDisabled: {
    opacity: 0.5,
  },
  settingIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  settingCopy: {
    flex: 1,
    gap: 2,
  },
  settingTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  switchTrack: {
    width: 46,
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderRadius: 14,
    backgroundColor: '#444947',
  },
  switchTrackActive: {
    backgroundColor: '#85B7EB',
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'white',
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  hdrTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  plannedBadge: {
    color: '#FAC775',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.7,
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
    paddingVertical: 7,
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
