import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
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

const CARD_WIDTH = 220;
const CARD_GAP = 18;
const ITEM_WIDTH = CARD_WIDTH + CARD_GAP;

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
  index: number;
  mode: CaptureModeOption;
  scrollX: SharedValue<number>;
  onPress: () => void;
}

function ModeCard({ index, mode, scrollX, onPress }: ModeCardProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const center = index * ITEM_WIDTH;
    const distance = scrollX.value - center;

    return {
      opacity: interpolate(distance, [-ITEM_WIDTH, 0, ITEM_WIDTH], [0.55, 1, 0.55], 'clamp'),
      transform: [
        { perspective: 900 },
        { translateY: interpolate(Math.abs(distance), [0, ITEM_WIDTH], [0, 28], 'clamp') },
        { scale: interpolate(Math.abs(distance), [0, ITEM_WIDTH], [1, 0.78], 'clamp') },
        {
          rotateY: `${interpolate(
            distance,
            [-ITEM_WIDTH, 0, ITEM_WIDTH],
            [-30, 0, 30],
            'clamp',
          )}deg`,
        },
      ],
      borderColor: interpolateColor(
        Math.min(Math.abs(distance) / ITEM_WIDTH, 1),
        [0, 1],
        [mode.tint, 'rgba(255,255,255,0.12)'],
      ),
    };
  });

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Select ${mode.name}`} onPress={onPress}>
      <Animated.View style={[styles.card, animatedStyle]}>
        <View style={[styles.cardArtwork, { backgroundColor: `${mode.tint}22` }]}>
          <View style={[styles.artOrbLarge, { backgroundColor: `${mode.tint}24` }]} />
          <View style={[styles.artOrbSmall, { backgroundColor: `${mode.tint}38` }]} />
          <Ionicons name={mode.icon} size={82} color={mode.tint} style={styles.heroIcon} />
          <View style={styles.artHorizon} />
        </View>
        <View style={styles.cardCopy}>
          <View style={[styles.cardIcon, { backgroundColor: `${mode.tint}24` }]}>
            <Ionicons name={mode.icon} size={22} color={mode.tint} />
          </View>
          <Text numberOfLines={1} style={styles.cardTitle}>{mode.name}</Text>
          <Text numberOfLines={2} style={styles.cardDescription}>{mode.description}</Text>
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
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<CaptureModeOption>>(null);
  const initialIndex = Math.max(0, MODES.findIndex((mode) => mode.id === selectedId));
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const scrollX = useSharedValue(initialIndex * ITEM_WIDTH);
  const sidePadding = Math.max(0, (width - CARD_WIDTH) / 2);
  const activeMode = MODES[activeIndex] ?? NORMAL_MODE;

  useEffect(() => {
    if (!visible) return;
    const index = Math.max(0, MODES.findIndex((mode) => mode.id === selectedId));
    setActiveIndex(index);
    scrollX.value = index * ITEM_WIDTH;
    requestAnimationFrame(() => listRef.current?.scrollToIndex({ index, animated: false }));
  }, [scrollX, selectedId, visible]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const snapToIndex = (index: number) => {
    if (index === activeIndex) return;
    setActiveIndex(index);
    Haptics.selectionAsync();
  };

  const footerTint = useMemo(() => activeMode.tint, [activeMode.tint]);

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
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>INTELLICAM</Text>
              <Text style={styles.title}>Choose capture mode</Text>
            </View>
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.closeButton}>
              <Ionicons name="close" size={24} color="white" />
            </Pressable>
          </View>

          <Animated.FlatList
            ref={listRef}
            data={MODES}
            horizontal
            showsHorizontalScrollIndicator={false}
            bounces={false}
            decelerationRate="fast"
            snapToInterval={ITEM_WIDTH}
            snapToAlignment="start"
            contentContainerStyle={{ paddingHorizontal: sidePadding, gap: CARD_GAP }}
            getItemLayout={(_, index) => ({
              index,
              length: ITEM_WIDTH,
              offset: ITEM_WIDTH * index,
            })}
            initialScrollIndex={initialIndex}
            keyExtractor={(mode) => mode.id}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => {
              const index = Math.max(
                0,
                Math.min(MODES.length - 1, Math.round(event.nativeEvent.contentOffset.x / ITEM_WIDTH)),
              );
              snapToIndex(index);
            }}
            renderItem={({ item, index }) => (
              <ModeCard
                index={index}
                mode={item}
                scrollX={scrollX}
                onPress={() => {
                  listRef.current?.scrollToIndex({ index, animated: true });
                  snapToIndex(index);
                }}
              />
            )}
          />

          <View style={styles.details}>
            <View style={styles.modeHeading}>
              <Ionicons name={activeMode.icon} size={20} color={activeMode.tint} />
              <Text style={styles.activeName}>{activeMode.name}</Text>
            </View>
            <Text style={styles.activeDescription}>{activeMode.description}</Text>
            <Text style={styles.activeTip}>{activeMode.tip}</Text>
          </View>

          <View style={styles.dots}>
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

          <Text style={styles.swipeHint}>Swipe to explore moods</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Apply ${activeMode.name} mode`}
            onPress={() => onApply(activeMode.id)}
            style={({ pressed }) => [
              styles.applyButton,
              { backgroundColor: footerTint, opacity: pressed ? 0.82 : 1 },
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
    maxHeight: '88%',
    gap: 16,
    paddingTop: 10,
    backgroundColor: '#121313',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.13)',
    overflow: 'hidden',
  },
  handle: {
    width: 42,
    height: 5,
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  eyebrow: {
    color: '#7B8A85',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  title: {
    color: 'white',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  card: {
    width: CARD_WIDTH,
    height: 270,
    borderRadius: 24,
    borderWidth: 1.5,
    backgroundColor: '#1A1C1C',
    overflow: 'hidden',
  },
  cardArtwork: {
    height: 174,
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
    position: 'absolute',
    alignSelf: 'center',
    top: 44,
    opacity: 0.9,
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
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  cardIcon: {
    position: 'absolute',
    top: -22,
    left: 15,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  cardTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
  },
  cardDescription: {
    color: '#A7AEAB',
    fontSize: 12,
    lineHeight: 17,
  },
  details: {
    alignItems: 'center',
    gap: 3,
    minHeight: 68,
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
    color: '#7E8984',
    fontSize: 12,
    textAlign: 'center',
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
    color: '#66706C',
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
  applyText: {
    color: '#08110E',
    fontSize: 16,
    fontWeight: '800',
  },
});
