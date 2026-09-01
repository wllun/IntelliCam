import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CAPTURE_MODES,
  NORMAL_CAPTURE_MODE,
  type CaptureModeOption,
} from '@/constants/capture-modes';

interface CaptureModeCarouselProps {
  selectedId: string;
  visible: boolean;
  onApply: (modeId: string) => void;
  onClose: () => void;
}

interface ModeCardProps {
  cardHeight: number;
  cardWidth: number;
  index: number;
  mode: CaptureModeOption;
  position: SharedValue<number>;
  selected: boolean;
  sideOffset: number;
  onPress: () => void;
  reducedMotion: boolean;
}

const LAST_MODE_INDEX = CAPTURE_MODES.length - 1;
const SHEET_SPRING = {
  duration: 300,
  dampingRatio: 0.82,
  reduceMotion: ReduceMotion.System,
} as const;
const CARD_SPRING = {
  duration: 400,
  dampingRatio: 0.8,
  reduceMotion: ReduceMotion.System,
} as const;
const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function ModeCard({
  cardHeight,
  cardWidth,
  index,
  mode,
  position,
  selected,
  sideOffset,
  onPress,
  reducedMotion,
}: ModeCardProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const distance = index - position.get();
    const absoluteDistance = Math.abs(distance);
    const secondOffset = sideOffset * 1.72;
    const translateX = interpolate(
      distance,
      [-2, -1, 0, 1, 2],
      [-secondOffset, -sideOffset, 0, sideOffset, secondOffset],
      Extrapolation.CLAMP,
    );

    return {
      zIndex: Math.round(100 - Math.min(absoluteDistance, CAPTURE_MODES.length) * 10),
      opacity: interpolate(
        absoluteDistance,
        [0, 1, 2],
        reducedMotion ? [1, 0.52, 0] : [1, 0.6, 0],
        Extrapolation.CLAMP,
      ),
      borderColor: interpolateColor(
        Math.min(absoluteDistance, 1),
        [0, 1],
        [mode.tint, 'rgba(255,255,255,0.14)'],
      ),
      transform: [
        { perspective: 900 },
        { translateX },
        {
          translateY: reducedMotion
            ? 0
            : interpolate(absoluteDistance, [0, 1, 2], [0, 24, 40], Extrapolation.CLAMP),
        },
        {
          scale: interpolate(
            absoluteDistance,
            [0, 1, 2],
            reducedMotion ? [1, 0.94, 0.9] : [1, 0.8, 0.68],
            Extrapolation.CLAMP,
          ),
        },
        {
          rotateY: `${
            reducedMotion
              ? 0
              : interpolate(
                  distance,
                  [-2, -1, 0, 1, 2],
                  [34, 28, 0, -28, -34],
                  Extrapolation.CLAMP,
                )
          }deg`,
        },
      ],
    };
  }, [index, mode.tint, reducedMotion, sideOffset]);

  return (
    <Animated.View
      style={[
        styles.card,
        { height: cardHeight, width: cardWidth },
        animatedStyle,
      ]}>
      <Pressable
        accessibilityHint={selected ? 'Currently centered' : 'Double tap to center this mode'}
        accessibilityLabel={`${mode.name}. ${mode.description}`}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}>
        <Image
          accessibilityIgnoresInvertColors
          contentFit="cover"
          source={mode.artwork}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.cardShadeSoft} />
        <View style={styles.cardShadeStrong} />
        <View style={styles.cardCopy}>
          <View
            style={[
              styles.cardIcon,
              { backgroundColor: `${mode.tint}E8`, borderColor: `${mode.tint}F4` },
            ]}>
            <Ionicons name={mode.icon} size={21} color="#07110D" />
          </View>
          <Text numberOfLines={1} style={styles.cardTitle}>
            {mode.name}
          </Text>
          <Text numberOfLines={2} style={styles.cardDescription}>
            {mode.description}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function CaptureModeCarousel({
  selectedId,
  visible,
  onApply,
  onClose,
}: CaptureModeCarouselProps) {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const selectedIndex = Math.max(
    0,
    CAPTURE_MODES.findIndex((mode) => mode.id === selectedId),
  );
  const [draftIndex, setDraftIndex] = useState(selectedIndex);
  const [modalMounted, setModalMounted] = useState(visible);
  const modalMountedRef = useRef(visible);
  const settledIndexRef = useRef(selectedIndex);
  const position = useSharedValue(selectedIndex);
  const gestureStart = useSharedValue(selectedIndex);
  const scrimOpacity = useSharedValue(0);
  const sheetOffset = useSharedValue(reducedMotion ? 0 : 54);

  const isShortScreen = height < 700;
  const sheetHeight = Math.min(
    height - Math.max(insets.top + 12, 32),
    height * (isShortScreen ? 0.9 : 0.82),
  );
  const cardHeight = clamp(
    sheetHeight - (isShortScreen ? 245 : 310),
    202,
    360,
  );
  const cardWidth = clamp(cardHeight * 0.625, 164, 230);
  const sideOffset = Math.min(cardWidth * 0.59, width * 0.29);
  const dragStep = Math.max(118, sideOffset);
  const activeMode = CAPTURE_MODES[draftIndex] ?? NORMAL_CAPTURE_MODE;

  const finishHiding = useCallback(() => {
    modalMountedRef.current = false;
    setModalMounted(false);
  }, []);

  const announceSettledMode = useCallback((index: number) => {
    if (settledIndexRef.current === index) return;
    settledIndexRef.current = index;
    void Haptics.selectionAsync();
  }, []);

  const setGestureDraft = useCallback((index: number) => {
    setDraftIndex(index);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const index = Math.max(
      0,
      CAPTURE_MODES.findIndex((mode) => mode.id === selectedId),
    );
    cancelAnimation(position);
    position.set(index);
    gestureStart.set(index);
    settledIndexRef.current = index;
    setDraftIndex(index);
  }, [gestureStart, position, selectedId, visible]);

  useEffect(() => {
    cancelAnimation(scrimOpacity);
    cancelAnimation(sheetOffset);

    if (visible) {
      modalMountedRef.current = true;
      setModalMounted(true);
      scrimOpacity.set(0);
      sheetOffset.set(reducedMotion ? 0 : 54);

      const frame = requestAnimationFrame(() => {
        scrimOpacity.set(withTiming(1, { duration: 180, easing: EASE_OUT }));
        sheetOffset.set(
          reducedMotion
            ? withTiming(0, { duration: 120, easing: EASE_OUT })
            : withSpring(0, SHEET_SPRING),
        );
      });
      return () => cancelAnimationFrame(frame);
    }

    if (!modalMountedRef.current) return;
    scrimOpacity.set(withTiming(0, { duration: 110, easing: EASE_OUT }));
    sheetOffset.set(
      withTiming(
        reducedMotion ? 0 : 34,
        { duration: reducedMotion ? 100 : 140, easing: EASE_OUT },
        (finished) => {
          if (finished) scheduleOnRN(finishHiding);
        },
      ),
    );
  }, [finishHiding, reducedMotion, scrimOpacity, sheetOffset, visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: scrimOpacity.get(),
  }));

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetOffset.get() }],
  }));

  const moveToIndex = useCallback(
    (index: number) => {
      const nextIndex = clamp(index, 0, LAST_MODE_INDEX);
      if (nextIndex === draftIndex && Math.abs(position.get() - nextIndex) < 0.001) return;

      cancelAnimation(position);
      setDraftIndex(nextIndex);
      position.set(
        reducedMotion
          ? withTiming(nextIndex, { duration: 160, easing: EASE_OUT }, (finished) => {
              if (finished) scheduleOnRN(announceSettledMode, nextIndex);
            })
          : withSpring(nextIndex, CARD_SPRING, (finished) => {
              if (finished) scheduleOnRN(announceSettledMode, nextIndex);
            }),
      );
    },
    [announceSettledMode, draftIndex, position, reducedMotion],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-14, 14])
        .onStart(() => {
          cancelAnimation(position);
          gestureStart.set(position.get());
        })
        .onUpdate((event) => {
          const rawPosition = gestureStart.get() - event.translationX / dragStep;
          const resistedPosition =
            rawPosition < 0
              ? rawPosition * 0.18
              : rawPosition > LAST_MODE_INDEX
                ? LAST_MODE_INDEX + (rawPosition - LAST_MODE_INDEX) * 0.18
                : rawPosition;
          position.set(resistedPosition);
        })
        .onEnd((event) => {
          const projectedPosition = position.get() - (event.velocityX / dragStep) * 0.18;
          const nextIndex = Math.round(clamp(projectedPosition, 0, LAST_MODE_INDEX));
          const velocity = -event.velocityX / dragStep;
          scheduleOnRN(setGestureDraft, nextIndex);
          position.set(
            reducedMotion
              ? withTiming(nextIndex, { duration: 160, easing: EASE_OUT }, (finished) => {
                  if (finished) scheduleOnRN(announceSettledMode, nextIndex);
                })
              : withSpring(nextIndex, { ...CARD_SPRING, velocity }, (finished) => {
                  if (finished) scheduleOnRN(announceSettledMode, nextIndex);
                }),
          );
        }),
    [
      announceSettledMode,
      dragStep,
      gestureStart,
      position,
      reducedMotion,
      setGestureDraft,
    ],
  );

  return (
    <Modal
      accessibilityViewIsModal
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={modalMounted}>
      <View style={styles.modalRoot}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            accessibilityLabel="Close mode selection"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              paddingBottom: Math.max(insets.bottom, isShortScreen ? 8 : 18),
            },
            sheetAnimatedStyle,
          ]}>
          <View style={styles.handle} />
          <View style={[styles.header, isShortScreen && styles.headerShort]}>
            <Text style={styles.title}>Choose capture mode</Text>
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              hitSlop={6}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}>
              <Ionicons name="close" size={24} color="white" />
            </Pressable>
          </View>

          <GestureDetector gesture={panGesture}>
            <Animated.View
              accessibilityActions={[{ name: 'decrement' }, { name: 'increment' }]}
              accessibilityHint="Swipe horizontally, or use increment and decrement actions"
              accessibilityLabel={`Capture mode swiper. ${activeMode.name} selected`}
              accessibilityRole="adjustable"
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'increment') moveToIndex(draftIndex + 1);
                if (event.nativeEvent.actionName === 'decrement') moveToIndex(draftIndex - 1);
              }}
              style={[styles.stage, { height: cardHeight + 16 }]}>
              {CAPTURE_MODES.map((mode, index) => (
                <ModeCard
                  key={mode.id}
                  cardHeight={cardHeight}
                  cardWidth={cardWidth}
                  index={index}
                  mode={mode}
                  onPress={() => moveToIndex(index)}
                  position={position}
                  reducedMotion={reducedMotion}
                  selected={index === draftIndex}
                  sideOffset={sideOffset}
                />
              ))}
            </Animated.View>
          </GestureDetector>

          <View style={[styles.details, isShortScreen && styles.detailsShort]}>
            <View style={styles.modeHeading}>
              <Ionicons name={activeMode.icon} size={20} color={activeMode.tint} />
              <Text style={styles.activeName}>{activeMode.name}</Text>
            </View>
            {!isShortScreen && (
              <Text numberOfLines={1} style={styles.activeDescription}>
                {activeMode.description}
              </Text>
            )}
            <Text numberOfLines={1} style={styles.activeTip}>
              {activeMode.tip}
            </Text>
          </View>

          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.dots}>
            {CAPTURE_MODES.map((mode, index) => (
              <View
                key={mode.id}
                style={[
                  styles.dot,
                  index === draftIndex && {
                    width: 19,
                    backgroundColor: activeMode.tint,
                  },
                ]}
              />
            ))}
          </View>

          {!isShortScreen && (
            <View style={styles.swipeHint}>
              <Ionicons name="swap-horizontal-outline" size={16} color="#96A09B" />
              <Text style={styles.swipeHintText}>Swipe to explore modes</Text>
            </View>
          )}

          <Pressable
            accessibilityLabel={`Apply ${activeMode.name} mode`}
            accessibilityRole="button"
            onPress={() => onApply(activeMode.id)}
            style={({ pressed }) => [
              styles.applyButton,
              isShortScreen && styles.applyButtonShort,
              pressed && styles.applyButtonPressed,
            ]}>
            <Text style={styles.applyText}>Apply {activeMode.name} mode</Text>
            <Ionicons name="arrow-forward" size={20} color="#07110D" />
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    gap: 8,
    paddingTop: 10,
    backgroundColor: '#111313',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  handle: {
    width: 42,
    height: 5,
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  header: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 66,
  },
  headerShort: {
    minHeight: 44,
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.45,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 14,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  closeButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.17)',
  },
  stage: {
    marginHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    position: 'absolute',
    borderRadius: 24,
    borderWidth: 2,
    backgroundColor: '#191B1A',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.38,
    shadowRadius: 20,
    elevation: 14,
  },
  cardPressable: {
    flex: 1,
  },
  cardPressed: {
    opacity: 0.86,
  },
  cardShadeSoft: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 82,
    height: 88,
    backgroundColor: 'rgba(3,7,6,0.24)',
  },
  cardShadeStrong: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 108,
    backgroundColor: 'rgba(3,7,6,0.72)',
  },
  cardCopy: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 128,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  cardIcon: {
    width: 42,
    height: 42,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    borderWidth: 1,
  },
  cardTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  cardDescription: {
    marginTop: 3,
    color: '#D2D8D5',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  details: {
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 24,
  },
  detailsShort: {
    minHeight: 38,
  },
  modeHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeName: {
    color: 'white',
    fontSize: 19,
    fontWeight: '700',
  },
  activeDescription: {
    color: '#BDC5C1',
    fontSize: 13,
  },
  activeTip: {
    color: '#929D97',
    fontSize: 12,
    textAlign: 'center',
  },
  dots: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#414744',
  },
  swipeHint: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  swipeHintText: {
    color: '#96A09B',
    fontSize: 11,
  },
  applyButton: {
    minHeight: 56,
    marginHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 17,
    backgroundColor: '#E5FFF4',
  },
  applyButtonShort: {
    minHeight: 48,
  },
  applyButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  applyText: {
    color: '#07110D',
    fontSize: 16,
    fontWeight: '800',
  },
});
