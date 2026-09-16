import { memo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

interface PortraitPreviewBlurProps {
  width: number;
  height: number;
  focusX: number;
  focusY: number;
}

const FOCUS_WIDTH_FRACTION = 0.58;
const FOCUS_HEIGHT_FRACTION = 0.48;

export const PortraitPreviewBlur = memo(function PortraitPreviewBlur({
  width,
  height,
  focusX,
  focusY,
}: PortraitPreviewBlurProps) {
  const focusWidth = width * FOCUS_WIDTH_FRACTION;
  const focusHeight = height * FOCUS_HEIGHT_FRACTION;
  const centerX = Math.max(focusWidth / 2, Math.min(width - focusWidth / 2, focusX * width));
  const centerY = Math.max(focusHeight / 2, Math.min(height - focusHeight / 2, focusY * height));
  const left = centerX - focusWidth / 2;
  const top = centerY - focusHeight / 2;
  const right = left + focusWidth;
  const bottom = top + focusHeight;
  const blurProps = {
    intensity: 90,
    tint: 'default' as const,
    experimentalBlurMethod: Platform.OS === 'android' ? 'dimezisBlurView' as const : undefined,
    blurReductionFactor: 2,
  };

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <BlurView {...blurProps} style={{ position: 'absolute', top: 0, left: 0, width, height: top }} />
      <BlurView {...blurProps} style={{ position: 'absolute', top, left: 0, width: left, height: focusHeight }} />
      <BlurView {...blurProps} style={{ position: 'absolute', top, left: right, width: width - right, height: focusHeight }} />
      <BlurView {...blurProps} style={{ position: 'absolute', top: bottom, left: 0, width, height: height - bottom }} />
    </View>
  );
});
