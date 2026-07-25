import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraType, CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, type Href } from 'expo-router';

import { PRESETS } from '@/constants/presets';

const ALBUM_NAME = 'IntelliCam';
type CaptureMode = 'normal' | 'preset';

const FLASH_MODES: FlashMode[] = ['off', 'auto', 'on'];

function formatPictureSize(size: string) {
  const [width, height] = size.split('x').map(Number);
  if (!width || !height) return size;
  const megapixels = ((width * height) / 1_000_000).toFixed(1);
  return `${megapixels} MP · ${size}`;
}

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
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
  const [pictureSizes, setPictureSizes] = useState<string[]>([]);
  const [pictureSize, setPictureSize] = useState<string>();

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

  const hasCameraPermission = cameraPermission?.granted ?? false;
  const hasMediaPermission = mediaPermission?.granted ?? false;
  const preset = PRESETS[presetIndex];
  const isNormalMode = captureMode === 'normal';

  const loadPictureSizes = async () => {
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
      if (!sizes?.length) return;
      const sorted = [...sizes].sort((a, b) => {
        const pixels = (value: string) => {
          const [width, height] = value.split('x').map(Number);
          return (width || 0) * (height || 0);
        };
        return pixels(b) - pixels(a);
      });
      setPictureSizes(sorted.slice(0, 6));
      setPictureSize((current) => current ?? sorted[0]);
    } catch {
      setPictureSizes([]);
    }
  };

  const changePreset = (direction: 1 | -1) => {
    setPresetIndex((i) => (i + direction + PRESETS.length) % PRESETS.length);
    setCardVisible(true);
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

  const cycleFlash = () => {
    setFlash((current) => FLASH_MODES[(FLASH_MODES.indexOf(current) + 1) % FLASH_MODES.length]);
    Haptics.selectionAsync();
  };

  const chooseMode = (mode: CaptureMode) => {
    setCaptureMode(mode);
    setModeMenuVisible(false);
    setCardVisible(mode === 'preset');
    Haptics.selectionAsync();
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
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 1,
        shutterSound: false,
      });
      if (!photo) throw new Error('The camera did not return a photo.');
      const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
      if (!album) {
        await MediaLibrary.createAlbumAsync(ALBUM_NAME, undefined, false, photo.uri);
      } else {
        await MediaLibrary.createAssetAsync(photo.uri, album);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert('Capture failed', String(error));
    } finally {
      setCapturing(false);
    }
  };

  return (
    <GestureDetector gesture={swipe}>
      <View style={styles.container}>
        {appActive && screenFocused && (
          <CameraView
            key={`${facing}-${pictureSize ?? 'default'}`}
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mode="picture"
            flash={flash}
            zoom={zoom}
            pictureSize={pictureSize}
            mirror={facing === 'front'}
            onCameraReady={() => {
              setCameraReady(true);
              loadPictureSizes();
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
          <View style={[styles.zoomControls, { bottom: insets.bottom + 122 }]}>
            {[0, 0.12, 0.28].map((value, index) => (
              <Pressable
                key={value}
                accessibilityLabel={`Zoom level ${index + 1}`}
                accessibilityRole="button"
                onPress={() => {
                  setZoom(value);
                  Haptics.selectionAsync();
                }}
                style={[styles.zoomButton, zoom === value && styles.zoomButtonActive]}>
                <Text style={[styles.zoomText, zoom === value && styles.zoomTextActive]}>
                  {index + 1}×
                </Text>
              </Pressable>
            ))}
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
            <Text style={styles.controlLabel}>{isNormalMode ? 'Normal' : 'Preset'}</Text>
          </Pressable>
        </View>

        {modeMenuVisible && (
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(120)}
            style={[styles.bottomSheet, { bottom: insets.bottom + 118 }]}>
            <Text style={styles.sheetTitle}>Capture mode</Text>
            <Pressable style={styles.modeRow} onPress={() => chooseMode('normal')}>
              <Ionicons name="camera-outline" size={22} color="#85B7EB" />
              <View style={styles.modeCopy}>
                <Text style={styles.modeTitle}>Normal camera</Text>
                <Text style={styles.modeDescription}>Automatic photo with flash, zoom and size controls</Text>
              </View>
              {isNormalMode && <Ionicons name="checkmark-circle" size={22} color="#85B7EB" />}
            </Pressable>
            <Pressable style={styles.modeRow} onPress={() => chooseMode('preset')}>
              <Ionicons name="color-wand-outline" size={22} color="#9FE1CB" />
              <View style={styles.modeCopy}>
                <Text style={styles.modeTitle}>Smart presets</Text>
                <Text style={styles.modeDescription}>Guided modes for stars, portraits and more</Text>
              </View>
              {!isNormalMode && <Ionicons name="checkmark-circle" size={22} color="#9FE1CB" />}
            </Pressable>
          </Animated.View>
        )}

        {settingsVisible && (
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(120)}
            style={[styles.settingsSheet, { top: insets.top + 68 }]}>
            <Text style={styles.sheetTitle}>Camera settings</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Flash</Text>
              <View style={styles.segmented}>
                {FLASH_MODES.map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => setFlash(mode)}
                    style={[styles.segment, flash === mode && styles.segmentActive]}>
                    <Text style={[styles.segmentText, flash === mode && styles.segmentTextActive]}>
                      {mode[0].toUpperCase() + mode.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Zoom</Text>
              <View style={styles.zoomStepper}>
                <Pressable
                  accessibilityLabel="Zoom out"
                  onPress={() => setZoom((value) => Math.max(0, Number((value - 0.05).toFixed(2))))}
                  style={styles.stepButton}>
                  <Ionicons name="remove" size={18} color="white" />
                </Pressable>
                <Text style={styles.zoomValue}>{Math.round(zoom * 100)}%</Text>
                <Pressable
                  accessibilityLabel="Zoom in"
                  onPress={() => setZoom((value) => Math.min(1, Number((value + 0.05).toFixed(2))))}
                  style={styles.stepButton}>
                  <Ionicons name="add" size={18} color="white" />
                </Pressable>
              </View>
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Camera</Text>
              <Pressable
                onPress={() => {
                  setCameraReady(false);
                  setFacing((current) => (current === 'back' ? 'front' : 'back'));
                }}
                style={styles.valueButton}>
                <Text style={styles.valueButtonText}>{facing === 'back' ? 'Rear' : 'Front'}</Text>
              </Pressable>
            </View>
            <Text style={styles.settingLabel}>Photo size</Text>
            <View style={styles.sizeList}>
              {pictureSizes.length ? pictureSizes.map((size) => (
                <Pressable
                  key={size}
                  onPress={() => {
                    setCameraReady(false);
                    setPictureSize(size);
                  }}
                  style={[styles.sizeButton, pictureSize === size && styles.sizeButtonActive]}>
                  <Text style={[styles.sizeText, pictureSize === size && styles.sizeTextActive]}>
                    {formatPictureSize(size)}
                  </Text>
                </Pressable>
              )) : <Text style={styles.modeDescription}>Using the device&apos;s default photo size</Text>}
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
  zoomControls: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    padding: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(20,20,20,0.65)',
  },
  zoomButton: {
    width: 34,
    height: 34,
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
  bottomSheet: {
    position: 'absolute',
    left: 18,
    right: 18,
    padding: 16,
    gap: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(20,20,20,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
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
  sheetTitle: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
  },
  modeRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  modeCopy: {
    flex: 1,
    gap: 3,
  },
  modeTitle: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  modeDescription: {
    color: '#aaa',
    fontSize: 12,
    lineHeight: 16,
  },
  settingRow: {
    gap: 8,
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
  zoomStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  zoomValue: {
    minWidth: 44,
    color: 'white',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  valueButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  valueButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  sizeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  sizeButton: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  sizeButtonActive: {
    backgroundColor: 'white',
  },
  sizeText: {
    color: '#ccc',
    fontSize: 11,
    fontWeight: '600',
  },
  sizeTextActive: {
    color: '#111',
  },
});
