import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PRESETS } from '@/constants/presets';

export interface CaptureModeOption {
  id: string;
  name: string;
  description: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  tint: string;
  tip: string;
}

interface CaptureModeCarouselProps {
  selectedId: string;
  visible: boolean;
  onApply: (modeId: string) => void;
  onClose: () => void;
}

const NORMAL_MODE: CaptureModeOption = {
  id: 'normal',
  name: 'Normal',
  description: 'Automatic everyday photo',
  icon: 'camera-outline',
  tint: '#85B7EB',
  tip: 'Flash, zoom and photo size controls',
};

const MIN_CARD_WIDTH = 208;
const MAX_CARD_WIDTH = 236;
const CARD_GAP = 14;

const MODES: CaptureModeOption[] = [
  NORMAL_MODE,
  ...PRESETS.map((preset) => ({
    id: preset.id,
    name: preset.name.replace(' photography', ''),
    description:
      preset.id === 'star'
        ? 'Night sky guidance'
        : preset.id === 'light-trail'
          ? 'Moving-light guidance'
          : preset.id === 'waterfall'
            ? 'Smooth motion guidance'
            : preset.id === 'portrait'
              ? 'People and face guidance'
              : 'Detailed subject guidance',
    icon: preset.icon,
    tint: preset.tint,
    tip: preset.tip,
  })),
];

interface ModeCardProps {
  artworkHeight: number;
  cardHeight: number;
  cardWidth: number;
  index: number;
  itemWidth: number;
  mode: CaptureModeOption;
  onPress: () => void;
  scrollX: SharedValue<number>;
  selected: boolean;
  showDescription: boolean;
}

function ModeCard({
  artworkHeight,
  cardHeight,
  cardWidth,
  index,
  itemWidth,
  mode,
  onPress,
  scrollX,
  selected,
  showDescription,
}: ModeCardProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const center = index * itemWidth;
    const distance = scrollX.value - center;

    return {
      opacity: interpolate(distance, [-itemWidth, 0, itemWidth], [0.48, 1, 0.48], 'clamp'),
      transform: [
        { perspective: 900 },
        { translateY: interpolate(Math.abs(distance), [0, itemWidth], [0, 30], 'clamp') },
        { scale: interpolate(Math.abs(distance), [0, itemWidth], [1, 0.78], 'clamp') },
        {
          rotateY: `${interpolate(
            distance,
            [-itemWidth, 0, itemWidth],
            [-12, 0, 12],
            'clamp',
          )}deg`,
        },
      ],
      borderColor: interpolateColor(
        Math.min(Math.abs(distance) / itemWidth, 1),
        [0, 1],
        [mode.tint, 'rgba(255,255,255,0.14)'],
      ),
    };
  });

  return (
    <Pressable
      accessibilityHint={selected ? 'Currently selected' : 'Double tap to center this mode'}
      accessibilityLabel={`${mode.name}. ${mode.description}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.modeCardPressed}>
      <Animated.View
        style={[
          styles.card,
          { width: cardWidth, height: cardHeight },
          animatedStyle,
        ]}>
        <View
          style={[
            styles.cardArtwork,
            { height: artworkHeight, backgroundColor: `${mode.tint}20` },
          ]}>
          <View style={[styles.artOrbLarge, { backgroundColor: `${mode.tint}24` }]} />
          <View style={[styles.artOrbSmall, { backgroundColor: `${mode.tint}38` }]} />
          <View style={[styles.artRay, { backgroundColor: `${mode.tint}24` }]} />
          <Ionicons
            name={mode.icon}
            size={showDescription ? 88 : 58}
            color={mode.tint}
            style={styles.heroIcon}
          />
          <View style={styles.artHorizon} />
        </View>
        <View style={styles.cardCopy}>
          <View
            style={[
              styles.cardIcon,
              { backgroundColor: `${mode.tint}E8`, borderColor: `${mode.tint}F2` },
            ]}>
            <Ionicons name={mode.icon} size={23} color="#08110E" />
          </View>
          <Text numberOfLines={1} style={styles.cardTitle}>{mode.name}</Text>
          {showDescription && (
            <Text numberOfLines={2} style={styles.cardDescription}>{mode.description}</Text>
          )}
        </View>
      </Animated.View>
    </Pressable>
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
  const listRef = useRef<FlatList<CaptureModeOption>>(null);
  const initialIndex = Math.max(0, MODES.findIndex((mode) => mode.id === selectedId));
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const cardWidth = Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, width * 0.58));
  const itemWidth = cardWidth + CARD_GAP;
  const isShortScreen = height < 600;
  const isCompactScreen = height < 720;
  const cardHeight = isShortScreen ? 150 : isCompactScreen ? 236 : 312;
  const artworkHeight = isShortScreen ? 90 : isCompactScreen ? 148 : 210;
  const sidePadding = Math.max(0, (width - cardWidth) / 2);
  const scrollX = useSharedValue(initialIndex * itemWidth);
  const activeMode = MODES[activeIndex] ?? NORMAL_MODE;

  useEffect(() => {
    if (!visible) return;
    const index = Math.max(0, MODES.findIndex((mode) => mode.id === selectedId));
    setActiveIndex(index);
    scrollX.value = index * itemWidth;
    requestAnimationFrame(() => listRef.current?.scrollToIndex({ index, animated: false }));
  }, [itemWidth, scrollX, selectedId, visible]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const snapToIndex = (index: number) => {
    if (index === activeIndex) return;
    setActiveIndex(index);
    void Haptics.selectionAsync();
  };

  const moveToIndex = (index: number) => {
    const nextIndex = Math.max(0, Math.min(MODES.length - 1, index));
    listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    snapToIndex(nextIndex);
  };

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}>
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={styles.backdrop}>
        <Pressable accessibilityLabel="Close mode selection" style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          entering={FadeIn.delay(60).duration(220)}
          style={[
            styles.sheet,
            isShortScreen && styles.sheetShort,
            { paddingBottom: Math.max(insets.bottom, isShortScreen ? 8 : 18) },
          ]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Choose capture mode</Text>
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}>
              <Ionicons name="close" size={24} color="white" />
            </Pressable>
          </View>

          <Animated.FlatList
            accessibilityActions={[{ name: 'decrement' }, { name: 'increment' }]}
            accessibilityHint="Swipe horizontally or use accessibility increment and decrement actions"
            accessibilityLabel={`Capture mode swiper. ${activeMode.name} selected`}
            accessibilityRole="adjustable"
            ref={listRef}
            data={MODES}
            horizontal
            showsHorizontalScrollIndicator={false}
            bounces={false}
            decelerationRate="fast"
            disableIntervalMomentum
            snapToInterval={itemWidth}
            snapToAlignment="start"
            style={{ flexGrow: 0, height: cardHeight + 34 }}
            contentContainerStyle={{ paddingHorizontal: sidePadding, gap: CARD_GAP }}
            getItemLayout={(_, index) => ({
              index,
              length: itemWidth,
              offset: itemWidth * index,
            })}
            initialScrollIndex={initialIndex}
            keyExtractor={(mode) => mode.id}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'increment') moveToIndex(activeIndex + 1);
              if (event.nativeEvent.actionName === 'decrement') moveToIndex(activeIndex - 1);
            }}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => {
              const index = Math.max(
                0,
                Math.min(MODES.length - 1, Math.round(event.nativeEvent.contentOffset.x / itemWidth)),
              );
              snapToIndex(index);
            }}
            renderItem={({ item, index }) => (
              <ModeCard
                artworkHeight={artworkHeight}
                cardHeight={cardHeight}
                cardWidth={cardWidth}
                index={index}
                itemWidth={itemWidth}
                mode={item}
                scrollX={scrollX}
                selected={index === activeIndex}
                showDescription={!isShortScreen}
                onPress={() => moveToIndex(index)}
              />
            )}
          />

          <View style={styles.details}>
            <View style={styles.modeHeading}>
              <Ionicons name={activeMode.icon} size={20} color={activeMode.tint} />
              <Text style={styles.activeName}>{activeMode.name}</Text>
            </View>
            {!isShortScreen && (
              <Text style={styles.activeDescription}>{activeMode.description}</Text>
            )}
            <Text style={styles.activeTip}>{activeMode.tip}</Text>
          </View>

          <View style={styles.paginationRow}>
            <Pressable
              accessibilityLabel="Previous capture mode"
              accessibilityRole="button"
              accessibilityState={{ disabled: activeIndex === 0 }}
              disabled={activeIndex === 0}
              onPress={() => moveToIndex(activeIndex - 1)}
              style={({ pressed }) => [
                styles.paginationButton,
                activeIndex === 0 && styles.paginationButtonDisabled,
                pressed && styles.paginationButtonPressed,
              ]}>
              <Ionicons name="chevron-back" size={20} color="white" />
            </Pressable>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.dots}>
              {MODES.map((mode, index) => (
                <View
                  key={mode.id}
                  style={[
                    styles.dot,
                    index === activeIndex && { width: 18, backgroundColor: activeMode.tint },
                  ]}
                />
              ))}
            </View>
            <Pressable
              accessibilityLabel="Next capture mode"
              accessibilityRole="button"
              accessibilityState={{ disabled: activeIndex === MODES.length - 1 }}
              disabled={activeIndex === MODES.length - 1}
              onPress={() => moveToIndex(activeIndex + 1)}
              style={({ pressed }) => [
                styles.paginationButton,
                activeIndex === MODES.length - 1 && styles.paginationButtonDisabled,
                pressed && styles.paginationButtonPressed,
              ]}>
              <Ionicons name="chevron-forward" size={20} color="white" />
            </Pressable>
          </View>

          {!isShortScreen && <Text style={styles.swipeHint}>Swipe to explore modes</Text>}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Apply ${activeMode.name} mode`}
            onPress={() => onApply(activeMode.id)}
            style={({ pressed }) => [
              styles.applyButton,
              isShortScreen && styles.applyButtonShort,
              { backgroundColor: activeMode.tint, opacity: pressed ? 0.82 : 1 },
            ]}>
            <Text style={styles.applyText}>Apply mode</Text>
            <Ionicons name="arrow-forward" size={20} color="#08110E" />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  sheet: {
    maxHeight: '92%',
    gap: 12,
    paddingTop: 10,
    backgroundColor: '#121313',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.13)',
    overflow: 'hidden',
  },
  sheetShort: {
    maxHeight: '98%',
    gap: 6,
  },
  handle: {
    width: 42,
    height: 5,
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 64,
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  closeButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  modeCardPressed: {
    opacity: 0.88,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1.5,
    backgroundColor: '#1A1C1C',
    overflow: 'hidden',
  },
  cardArtwork: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  artOrbLarge: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    right: -60,
    top: -70,
  },
  artOrbSmall: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    left: -28,
    bottom: -18,
  },
  heroIcon: {
    opacity: 0.9,
  },
  artRay: {
    position: 'absolute',
    top: -30,
    width: 58,
    height: 280,
    transform: [{ rotate: '32deg' }],
  },
  artHorizon: {
    position: 'absolute',
    left: -20,
    right: -20,
    bottom: -36,
    height: 80,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.38)',
    transform: [{ rotate: '-5deg' }],
  },
  cardCopy: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  cardIcon: {
    position: 'absolute',
    top: -25,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  cardTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardDescription: {
    marginTop: 3,
    color: '#BBC3BF',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  details: {
    alignItems: 'center',
    gap: 3,
    minHeight: 58,
    paddingHorizontal: 24,
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
    color: '#B4BCB8',
    fontSize: 13,
  },
  activeTip: {
    color: '#9AA49F',
    fontSize: 12,
    textAlign: 'center',
  },
  paginationRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  paginationButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  paginationButtonDisabled: {
    opacity: 0.28,
  },
  paginationButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#414744',
  },
  swipeHint: {
    color: '#89938E',
    fontSize: 11,
    textAlign: 'center',
  },
  applyButton: {
    minHeight: 56,
    marginHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 17,
  },
  applyButtonShort: {
    minHeight: 48,
  },
  applyText: {
    color: '#08110E',
    fontSize: 16,
    fontWeight: '800',
  },
});
