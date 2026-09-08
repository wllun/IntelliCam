import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppUpdateState } from '@/hooks/use-app-update';
import { openAppUpdatePage } from '@/services/app-update-service';

interface AppUpdateGateProps {
  update: AppUpdateState;
  onRetry: (options?: { force?: boolean }) => Promise<unknown>;
}

export function AppUpdateGate({ update, onRetry }: AppUpdateGateProps) {
  const insets = useSafeAreaInsets();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  const handleUpdate = async () => {
    setOpening(true);
    setOpenError('');
    const opened = await openAppUpdatePage(update.updateUrl);
    if (!opened) {
      setOpenError('The update page could not be opened. Check your connection and try again.');
    }
    setOpening(false);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.content,
        { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) },
      ]}
    >
      <View style={styles.card} accessibilityViewIsModal>
        <View style={styles.iconCircle} accessible={false}>
          <Ionicons name="cloud-download-outline" size={34} color="#FFD400" />
        </View>

        <View style={styles.copy}>
          <Text style={styles.eyebrow}>INTELLICAM UPDATE</Text>
          <Text style={styles.title} accessibilityRole="header">
            Update required
          </Text>
          <Text style={styles.message} selectable>
            {update.message || 'A newer version of IntelliCam is required to continue.'}
          </Text>
          <Text style={styles.reassurance} selectable>
            Installing over the existing app keeps photos already saved in your device gallery.
          </Text>
        </View>

        <View style={styles.versionCard}>
          <View style={styles.versionColumn}>
            <Text style={styles.versionLabel}>INSTALLED</Text>
            <Text style={styles.versionValue}>{update.currentBuildVersion ?? '—'}</Text>
          </View>
          <Ionicons name="arrow-forward" size={19} color="#8A8A8A" />
          <View style={styles.versionColumn}>
            <Text style={styles.versionLabel}>REQUIRED</Text>
            <Text style={styles.versionValue}>{update.minimumVersionCode ?? '—'}</Text>
          </View>
        </View>

        {openError ? (
          <Text style={styles.error} accessibilityRole="alert" selectable>
            {openError}
          </Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
            opening && styles.disabled,
          ]}
          onPress={() => void handleUpdate()}
          disabled={opening}
          accessibilityRole="button"
          accessibilityLabel="Update IntelliCam"
          accessibilityState={{ disabled: opening, busy: opening }}
        >
          {opening ? (
            <ActivityIndicator color="#111111" />
          ) : (
            <Ionicons name="download-outline" size={21} color="#111111" />
          )}
          <Text style={styles.primaryButtonText}>
            {opening ? 'Opening update…' : 'Update IntelliCam'}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          onPress={() => void onRetry({ force: true })}
          disabled={update.checking}
          accessibilityRole="button"
          accessibilityLabel="Check IntelliCam version again"
          accessibilityState={{ disabled: update.checking, busy: update.checking }}
        >
          {update.checking ? <ActivityIndicator size="small" color="#FFD400" /> : null}
          <Text style={styles.retryButtonText}>
            {update.checking ? 'Checking…' : 'I updated — check again'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#080808',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    alignItems: 'center',
    gap: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: '#141414',
    boxShadow: '0 16px 40px rgba(0,0,0,0.36)',
  },
  iconCircle: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,212,0,0.34)',
    borderRadius: 34,
    backgroundColor: 'rgba(255,212,0,0.11)',
  },
  copy: {
    alignItems: 'center',
    gap: 9,
  },
  eyebrow: {
    color: '#FFD400',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '800',
    textAlign: 'center',
  },
  message: {
    color: '#E2E2E2',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  reassurance: {
    color: '#A6A6A6',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  versionCard: {
    width: '100%',
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  versionColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  versionLabel: {
    color: '#8F8F8F',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  versionValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  error: {
    color: '#FF8A80',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#FFD400',
  },
  primaryButtonText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '800',
  },
  retryButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  retryButtonText: {
    color: '#FFD400',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.55 },
});
