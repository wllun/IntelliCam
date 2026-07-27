import { useCallback, useEffect, useRef, useState } from 'react';
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
  CameraOrientation,
  CameraType,
  CameraView,
  FlashMode,
  type CameraRatio,
  useCameraPermissions,
} from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';

import { PRESETS } from '@/constants/presets';
import { CaptureModeCarousel } from '@/components/capture-mode-carousel';

const ALBUM_NAME = 'IntelliCam';
type CaptureMode = 'normal' | 'preset';
type TimerSeconds = 0 | 3 | 10;

const FLASH_MODES: FlashMode[] = ['off', 'auto', 'on'];
const ASPECT_RATIOS: CameraRatio[] = ['4:3', '1:1', '16:9'];
const TIMER_OPTIONS: TimerSeconds[] = [0, 3, 10];
const METERING_RESET_MS = 5000;
const EXPOSURE_MIN = -2;
const EXPOSURE_MAX = 2;
const EXPOSURE_STEP = 0.3;
const DIGITAL_ZOOM_STOPS = [0, 0.25, 0.5];
const ZOOM_TRANSITION_MS = 180;

interface FocusPoint {
  x: number;
  y: number;
}

function getLensLabel(lens: string) {
  if (lens.includes('UltraWide')) return '0.5×';
  if (lens.includes('Telephoto')) return 'Tele';
  if (lens.includes('WideAngle')) return '1×';
  if (lens.includes('TrueDepth')) return 'Front';
  return 'Lens';
}

function getLensOrder(lens: string) {
  if (lens.includes('UltraWide')) return 0;
  if (lens.includes('WideAngle')) return 1;
  if (lens.includes('Telephoto')) return 2;
  return 3;
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

function getLargestPictureSize(sizes: string[]) {
  return sizes.reduce<{ size?: string; pixels: number }>(
    (largest, size) => {
      const [pictureWidth, pictureHeight] = size.toLowerCase().split('x').map(Number);
      const pixels = pictureWidth * pictureHeight;
      return Number.isFinite(pixels) && pixels > largest.pixels
        ? { size, pixels }
        : largest;
    },
    { pixels: 0 },
  ).size;
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
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [presetIndex, setPresetIndex] = useState(0);
  const [cardVisible, setCardVisible] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [screenFocused, setScreenFocused] = useState(true);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('normal');
  const [modeMenuVisible, setModeMenuVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [flash, setFlash] = useState<FlashMode>('off');
  const [zoom, setZoom] = useState(0);
  const [availableLenses, setAvailableLenses] = useState<string[]>([]);
  const [selectedLens, setSelectedLens] = useState<string>();
  const [pictureSize, setPictureSize] = useState<string>();
  const [cameraOrientation, setCameraOrientation] = useState<CameraOrientation>(
    width > height ? 'landscapeLeft' : 'portrait',
  );
  const [gridLines, setGridLines] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<CameraRatio>('4:3');
  const [timerSeconds, setTimerSeconds] = useState<TimerSeconds>(0);
  const [hdrEnabled, setHdrEnabled] = useState(false);
  const [countdown, setCountdown] = useState<number>();
  const [focusPoint, setFocusPoint] = useState<FocusPoint>();
  const [exposureCompensation, setExposureCompensation] = useState(0);
  const [meteringLocked, setMeteringLocked] = useState(false);
  const meteringResetRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const zoomAnimationRef = useRef<number | undefined>(undefined);
  const pinchStartZoom = useSharedValue(0);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, []),
  );

  const cancelMeteringReset = useCallback(() => {
    if (meteringResetRef.current) {
      clearTimeout(meteringResetRef.current);
      meteringResetRef.current = undefined;
    }
  }, []);

  const resetMetering = useCallback(() => {
    cancelMeteringReset();
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
    const clampedTarget = Math.max(0, Math.min(1, target));
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
  }, [cancelZoomAnimation, zoom]);

  useEffect(() => cancelZoomAnimation, [cancelZoomAnimation]);

  useEffect(() => {
    resetMetering();
  }, [captureMode, facing, resetMetering]);

  useEffect(() => {
    cancelZoomAnimation();
    setZoom(0);
    setAvailableLenses([]);
    setSelectedLens(undefined);
    setPictureSize(undefined);
  }, [cancelZoomAnimation, facing]);

  useEffect(() => {
    setCameraOrientation(width > height ? 'landscapeLeft' : 'portrait');
  }, [height, width]);

  const hasCameraPermission = cameraPermission?.granted ?? false;
  const hasMediaPermission = mediaPermission?.granted ?? false;
  const preset = PRESETS[presetIndex];
  const isNormalMode = captureMode === 'normal';
  const isLandscapeCapture = cameraOrientation.startsWith('landscape');
  const previewFrame = getPreviewFrame(
    width,
    height,
    aspectRatio,
    isLandscapeCapture,
  );

  const changePreset = (direction: 1 | -1) => {
    setPresetIndex((i) => (i + direction + PRESETS.length) % PRESETS.length);
    setCardVisible(true);
    Haptics.selectionAsync();
  };

  const updateZoomFromPinch = (nextZoom: number) => {
    setZoom(Math.max(0, Math.min(1, nextZoom)));
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
      const delta = Math.log2(Math.max(0.1, event.scale)) * 0.22;
      runOnJS(updateZoomFromPinch)(pinchStartZoom.value + delta);
    });

  const cameraGesture = Gesture.Simultaneous(swipe, pinch);

  const cycleFlash = () => {
    setFlash((current) => FLASH_MODES[(FLASH_MODES.indexOf(current) + 1) % FLASH_MODES.length]);
    Haptics.selectionAsync();
  };

  const focusAt = (event: GestureResponderEvent) => {
    if (!isNormalMode || settingsVisible || modeMenuVisible) return;
    const { locationX, locationY } = event.nativeEvent;
    const point = {
      x: previewFrame.left + locationX,
      y: previewFrame.top + locationY,
    };
    setFocusPoint(point);
    setExposureCompensation(0);
    setMeteringLocked(false);
    scheduleMeteringReset();
    Haptics.selectionAsync();
  };

  const changeExposure = (direction: 1 | -1) => {
    setExposureCompensation((current) =>
      Math.max(
        EXPOSURE_MIN,
        Math.min(EXPOSURE_MAX, Number((current + direction * EXPOSURE_STEP).toFixed(1))),
      ),
    );
    if (!meteringLocked) scheduleMeteringReset();
    Haptics.selectionAsync();
  };

  const toggleMeteringLock = () => {
    if (!focusPoint) return;
    setMeteringLocked((locked) => {
      if (locked) {
        scheduleMeteringReset();
      } else {
        cancelMeteringReset();
      }
      return !locked;
    });
    Haptics.selectionAsync();
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
    if (capturing || !cameraReady) return;
    setCapturing(true);
    try {
      for (let remaining = timerSeconds; remaining > 0; remaining -= 1) {
        setCountdown(remaining);
        Haptics.selectionAsync();
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      setCountdown(undefined);

      const photo = await cameraRef.current?.takePictureAsync({
        quality: 1,
        shutterSound: false,
      });
      if (!photo) throw new Error('The camera did not return a photo.');
      const crop = getCenteredCrop(photo.width, photo.height, aspectRatio);
      let savedPhotoUri = photo.uri;

      if (crop) {
        const context = ImageManipulator.manipulate(photo.uri);
        context.crop(crop);
        const renderedImage = await context.renderAsync();
        const croppedPhoto = await renderedImage.saveAsync({
          compress: 1,
          format: SaveFormat.JPEG,
        });
        savedPhotoUri = croppedPhoto.uri;
      }

      const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
      if (!album) {
        await MediaLibrary.createAlbumAsync(ALBUM_NAME, undefined, false, savedPhotoUri);
      } else {
        await MediaLibrary.createAssetAsync(savedPhotoUri, album);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert('Capture failed', String(error));
    } finally {
      setCountdown(undefined);
      setCapturing(false);
    }
  };

  return (
    <GestureDetector gesture={cameraGesture}>
      <View style={styles.container}>
        <View style={[styles.previewFrame, previewFrame]}>
          {appActive && screenFocused && (
            <CameraView
              key={facing}
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={facing}
              mode="picture"
              autofocus={focusPoint ? 'on' : 'off'}
              flash={flash}
              zoom={zoom}
              pictureSize={pictureSize}
              responsiveOrientationWhenOrientationLocked
              selectedLens={process.env.EXPO_OS === 'ios' && facing === 'back' ? selectedLens : undefined}
              mirror={facing === 'front'}
              onResponsiveOrientationChanged={({ orientation }) => {
                setCameraOrientation(orientation);
              }}
              onAvailableLensesChanged={({ lenses }) => {
                const sortedLenses = [...lenses].sort((a, b) => getLensOrder(a) - getLensOrder(b));
                setAvailableLenses(sortedLenses);
                setSelectedLens((current) => (
                  current && sortedLenses.includes(current)
                    ? current
                    : sortedLenses.find((lens) => lens.includes('WideAngle')) ?? sortedLenses[0]
                ));
              }}
              onCameraReady={async () => {
                try {
                  const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
                  if (sizes?.length) setPictureSize(getLargestPictureSize(sizes));

                  if (process.env.EXPO_OS === 'ios' && facing === 'back') {
                    const lenses = await cameraRef.current?.getAvailableLensesAsync();
                    if (lenses?.length) {
                      const sortedLenses = [...lenses].sort(
                        (a, b) => getLensOrder(a) - getLensOrder(b),
                      );
                      setAvailableLenses(sortedLenses);
                      setSelectedLens((current) => (
                        current && sortedLenses.includes(current)
                          ? current
                          : sortedLenses.find((lens) => lens.includes('WideAngle')) ?? sortedLenses[0]
                      ));
                    }
                  }
                } catch (error) {
                  console.warn('Could not query camera capabilities:', error);
                } finally {
                  setCameraReady(true);
                }
              }}
              onMountError={(error) => {
                setCameraReady(false);
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
          <Animated.View entering={FadeIn.duration(120)} style={styles.countdown}>
            <Text style={styles.countdownText}>{countdown}</Text>
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
                left: Math.min(width - 126, focusPoint.x - 38),
                top: Math.min(height - insets.bottom - 270, focusPoint.y - 38),
              },
            ]}>
            <View
              accessible
              accessibilityLabel={`Focus point. Exposure ${exposureCompensation > 0 ? 'plus ' : ''}${exposureCompensation.toFixed(1)} EV. ${meteringLocked ? 'Locked' : 'Automatic reset enabled'}`}
              style={[styles.focusReticle, meteringLocked && styles.focusReticleLocked]}>
              <View style={styles.focusReticleCenter} />
            </View>
            <View style={styles.exposureControl}>
              <Pressable
                accessibilityLabel="Increase exposure"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => changeExposure(1)}
                style={styles.exposureButton}>
                <Ionicons name="sunny-outline" size={16} color="white" />
                <Ionicons name="add" size={11} color="white" />
              </Pressable>
              <Text style={styles.exposureValue}>
                {exposureCompensation > 0 ? '+' : ''}
                {exposureCompensation.toFixed(1)}
              </Text>
              <Pressable
                accessibilityLabel="Decrease exposure"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => changeExposure(-1)}
                style={styles.exposureButton}>
                <Ionicons name="sunny-outline" size={16} color="white" />
                <Ionicons name="remove" size={11} color="white" />
              </Pressable>
            </View>
            <Pressable
              accessibilityLabel={meteringLocked ? 'Unlock focus and exposure' : 'Lock focus and exposure'}
              accessibilityRole="button"
              accessibilityState={{ checked: meteringLocked }}
              hitSlop={8}
              onPress={toggleMeteringLock}
              style={[styles.meteringLock, meteringLocked && styles.meteringLockActive]}>
              <Ionicons name={meteringLocked ? 'lock-closed' : 'lock-open-outline'} size={14} color="white" />
              <Text style={styles.meteringLockText}>{meteringLocked ? 'AE/AF LOCK' : 'LOCK'}</Text>
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
                setCameraReady(false);
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
                {selectedLens ? `${getLensLabel(selectedLens)} lens · ` : ''}
                Digital {Math.round(zoom * 100)}% of max
              </Text>
            </View>
            <View style={styles.zoomControls}>
              {availableLenses.length > 1
                ? availableLenses.map((lens) => (
                    <Pressable
                      key={lens}
                      accessibilityLabel={`Use ${getLensLabel(lens)} camera lens`}
                      accessibilityRole="button"
                      onPress={() => {
                        cancelZoomAnimation();
                        setZoom(0);
                        setSelectedLens(lens);
                        Haptics.selectionAsync();
                      }}
                      style={[styles.zoomButton, selectedLens === lens && styles.zoomButtonActive]}>
                      <Text style={[styles.zoomText, selectedLens === lens && styles.zoomTextActive]}>
                        {getLensLabel(lens)}
                      </Text>
                    </Pressable>
                  ))
                : DIGITAL_ZOOM_STOPS.map((value) => {
                    const active = Math.abs(zoom - value) < 0.015;
                    return (
                      <Pressable
                        key={value}
                        accessibilityLabel={`Digital zoom ${Math.round(value * 100)} percent of maximum`}
                        accessibilityRole="button"
                        onPress={() => {
                          animateZoomTo(value);
                          Haptics.selectionAsync();
                        }}
                        style={[styles.zoomButton, active && styles.zoomButtonActive]}>
                        <Text style={[styles.zoomText, active && styles.zoomTextActive]}>
                          {Math.round(value * 100)}%
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
            <Ionicons name="images-outline" size={25} color="white" />
            <Text style={styles.controlLabel}>Gallery</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Take picture"
            accessibilityRole="button"
            style={[styles.shutter, capturing && styles.shutterDisabled]}
            disabled={capturing || !cameraReady}
            onPress={capture}>
            <View style={[styles.shutterInner, { borderColor: preset.tint }]} />
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
              accessibilityState={{ checked: hdrEnabled }}
              onPress={() => setHdrEnabled((enabled) => !enabled)}
              style={styles.toggleRow}>
              <View style={styles.settingIcon}>
                <Ionicons name="contrast-outline" size={20} color="white" />
              </View>
              <View style={styles.settingCopy}>
                <View style={styles.hdrTitleRow}>
                  <Text style={styles.settingTitle}>HDR</Text>
                  <Text style={styles.plannedBadge}>UI ONLY</Text>
                </View>
                <Text style={styles.settingsDescription}>Multi-frame processing is not connected yet</Text>
              </View>
              <View style={[styles.switchTrack, hdrEnabled && styles.switchTrackActive]}>
                <View style={[styles.switchThumb, hdrEnabled && styles.switchThumbActive]} />
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
    minWidth: 44,
    height: 34,
    paddingHorizontal: 7,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomButtonActive: {
    backgroundColor: 'white',
  },
  zoomText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  zoomTextActive: {
    color: '#111',
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
    height: 94,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderRadius: 21,
    backgroundColor: 'rgba(16,16,16,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  exposureButton: {
    width: 34,
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 17,
    backgroundColor: 'rgba(16,16,16,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  meteringLockActive: {
    backgroundColor: 'rgba(118,77,0,0.88)',
    borderColor: '#FFB329',
  },
  meteringLockText: {
    color: 'white',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
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
