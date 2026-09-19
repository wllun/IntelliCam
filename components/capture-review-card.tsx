import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type CaptureReviewStatus = 'processing' | 'saving' | 'saved' | 'failed' | 'retrying';

interface CaptureReviewCardProps {
  uri: string;
  status: CaptureReviewStatus;
  errorMessage?: string;
  topInset: number;
  onRetry: () => void;
  onDelete: () => void;
}

const STATUS_COPY: Record<Exclude<CaptureReviewStatus, 'failed'>, {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
}> = {
  processing: {
    icon: 'sparkles-outline',
    title: 'Processing photo…',
    message: 'Keep IntelliCam open while the final image is prepared.',
  },
  saving: {
    icon: 'cloud-upload-outline',
    title: 'Saving photo…',
    message: 'The finished image is being added to your IntelliCam album.',
  },
  saved: {
    icon: 'checkmark-circle',
    title: 'Saved to IntelliCam',
    message: 'Your photo is safely stored in the gallery.',
  },
  retrying: {
    icon: 'refresh',
    title: 'Retrying save…',
    message: 'Your retained photo is being added to the gallery.',
  },
};

export function CaptureReviewCard({
  uri,
  status,
  errorMessage,
  topInset,
  onRetry,
  onDelete,
}: CaptureReviewCardProps) {
  const failed = status === 'failed';
  const copy = failed ? {
    icon: 'alert-circle' as const,
    title: 'Photo not saved',
    message: errorMessage ?? 'The photo is retained safely in IntelliCam. Retry or delete it.',
  } : STATUS_COPY[status];

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.card, { top: topInset + 62 }, failed && styles.failedCard]}>
      <Image source={{ uri }} style={styles.preview} contentFit="cover" transition={100} />
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Ionicons
            name={copy.icon}
            size={18}
            color={failed ? '#FF8178' : status === 'saved' ? '#9FE1CB' : 'white'}
          />
          <Text style={styles.title}>{copy.title}</Text>
        </View>
        <Text selectable={failed} numberOfLines={failed ? 3 : 2} style={styles.message}>
          {copy.message}
        </Text>
        {failed && (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete retained photo"
              onPress={onDelete}
              style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
              <Ionicons name="trash-outline" size={16} color="white" />
              <Text style={styles.deleteLabel}>Delete</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry saving photo"
              onPress={onRetry}
              style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
              <Ionicons name="refresh" size={16} color="#07110D" />
              <Text style={styles.retryLabel}>Retry</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 30,
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    overflow: 'hidden',
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(12,16,15,0.94)',
    boxShadow: '0 8px 28px rgba(0,0,0,0.38)',
  },
  failedCard: {
    borderColor: 'rgba(255,129,120,0.48)',
  },
  preview: {
    width: 72,
    height: 72,
    borderRadius: 15,
    borderCurve: 'continuous',
    backgroundColor: '#252525',
  },
  copy: {
    flex: 1,
    gap: 5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  title: {
    flex: 1,
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
  message: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 3,
  },
  deleteButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  retryButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: '#9FE1CB',
  },
  deleteLabel: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
  retryLabel: {
    color: '#07110D',
    fontSize: 13,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
  },
});
