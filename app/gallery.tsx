import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MediaTrash from '@/modules/media-trash';
import {
  getPhotoInformation,
  type PhotoInfoSection,
} from '@/services/photo-metadata';

const ALBUM_NAME = 'IntelliCam';
const PAGE_SIZE = 60;
const GRID_GAP = 2;

export default function GalleryScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<MediaLibrary.Asset | null>(null);
  const [photoMenuVisible, setPhotoMenuVisible] = useState(false);
  const [photoInfoVisible, setPhotoInfoVisible] = useState(false);
  const [photoInfoLoading, setPhotoInfoLoading] = useState(false);
  const [photoInfoError, setPhotoInfoError] = useState<string>();
  const [photoInfoSections, setPhotoInfoSections] = useState<PhotoInfoSection[]>([]);
  const [endCursor, setEndCursor] = useState<string>();
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string>();
  const [error, setError] = useState<string>();
  const itemSize = (width - GRID_GAP * 2) / 3;
  const selectedAssetIndex = selectedAsset
    ? Math.max(0, assets.findIndex((asset) => asset.id === selectedAsset.id))
    : 0;

  const loadAlbum = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(undefined);

    try {
      const permission = await MediaLibrary.getPermissionsAsync();
      if (!permission.granted) {
        setAssets([]);
        setError('Photo access is required to view the IntelliCam album.');
        return;
      }

      const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
      if (!album) {
        setAssets([]);
        setEndCursor(undefined);
        setHasNextPage(false);
        return;
      }

      const page = await MediaLibrary.getAssetsAsync({
        album,
        first: PAGE_SIZE,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      setAssets(page.assets);
      setEndCursor(page.endCursor);
      setHasNextPage(page.hasNextPage);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load IntelliCam photos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAlbum();
    }, [loadAlbum]),
  );

  useEffect(() => {
    const subscription = MediaLibrary.addListener(() => loadAlbum(true));
    return () => subscription.remove();
  }, [loadAlbum]);

  useEffect(() => {
    if (!selectedAsset) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (photoInfoVisible) {
        setPhotoInfoVisible(false);
      } else if (photoMenuVisible) {
        setPhotoMenuVisible(false);
      } else {
        setSelectedAsset(null);
      }
      return true;
    });

    return () => subscription.remove();
  }, [photoInfoVisible, photoMenuVisible, selectedAsset]);

  const loadMore = async () => {
    if (!hasNextPage || !endCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
      if (!album) return;
      const page = await MediaLibrary.getAssetsAsync({
        album,
        first: PAGE_SIZE,
        after: endCursor,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      setAssets((current) => {
        const known = new Set(current.map((asset) => asset.id));
        return [...current, ...page.assets.filter((asset) => !known.has(asset.id))];
      });
      setEndCursor(page.endCursor);
      setHasNextPage(page.hasNextPage);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load more photos.');
    } finally {
      setLoadingMore(false);
    }
  };

  const moveAssetToRecycleBin = async (asset: MediaLibrary.Asset) => {
    setDeletingAssetId(asset.id);
    try {
      let moved = false;
      if (Platform.OS === 'android') {
        if (!MediaTrash) {
          throw new Error('Recycle-bin support requires a rebuilt development app.');
        }
        if (!MediaTrash.isSupported) {
          throw new Error('The recycle bin requires Android 11 or newer.');
        }
        moved = await MediaTrash.trashAssetAsync(asset.id);
      } else if (Platform.OS === 'ios') {
        moved = await MediaLibrary.deleteAssetsAsync([asset.id]);
      } else {
        throw new Error('The recycle bin is not available on this platform.');
      }

      if (!moved) return;
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setPhotoMenuVisible(false);
      setSelectedAsset((current) => current?.id === asset.id ? null : current);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (deleteError) {
      Alert.alert(
        'Could not move photo',
        deleteError instanceof Error ? deleteError.message : 'The photo could not be moved to the recycle bin.',
      );
    } finally {
      setDeletingAssetId(undefined);
    }
  };

  const confirmMoveToRecycleBin = () => {
    const asset = selectedAsset;
    if (!asset || deletingAssetId) return;
    setPhotoMenuVisible(false);
    const destination = Platform.OS === 'ios' ? 'Recently Deleted' : 'Recycle Bin';
    Alert.alert(
      `Move to ${destination}?`,
      'The photo will leave the IntelliCam gallery and can be restored from your device gallery for a limited time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move',
          style: 'destructive',
          onPress: () => void moveAssetToRecycleBin(asset),
        },
      ],
    );
  };

  const openPhotoInformation = async () => {
    const asset = selectedAsset;
    if (!asset || photoInfoLoading) return;
    setPhotoMenuVisible(false);
    setPhotoInfoVisible(true);
    setPhotoInfoLoading(true);
    setPhotoInfoError(undefined);
    setPhotoInfoSections([]);
    try {
      const assetInfo = await MediaLibrary.getAssetInfoAsync(asset, {
        shouldDownloadFromNetwork: true,
      });
      setPhotoInfoSections(await getPhotoInformation(asset, assetInfo));
    } catch (infoError) {
      setPhotoInfoError(
        infoError instanceof Error
          ? infoError.message
          : 'The photo information could not be loaded.',
      );
    } finally {
      setPhotoInfoLoading(false);
    }
  };

  const closeSelectedPhoto = () => {
    setPhotoMenuVisible(false);
    setPhotoInfoVisible(false);
    setSelectedAsset(null);
  };

  const handlePreviewSwipeEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    const nextAsset = assets[nextIndex];

    if (nextAsset && nextAsset.id !== selectedAsset?.id) {
      setPhotoInfoVisible(false);
      setSelectedAsset(nextAsset);
    }
  };

  if (loading && assets.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="white" />
        <Text style={styles.secondaryText}>Loading IntelliCam photos…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: !selectedAsset,
          headerBackVisible: true,
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: '#080808',
          },
        }}
      />
      <FlatList
        data={assets}
        numColumns={3}
        keyExtractor={(asset) => asset.id}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadAlbum(true)} tintColor="white" />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityLabel={`View ${item.filename}`}
            accessibilityRole="imagebutton"
            onPress={() => {
              setPhotoMenuVisible(false);
              setSelectedAsset(item);
            }}
            style={{ width: itemSize, height: itemSize, marginRight: GRID_GAP, marginBottom: GRID_GAP }}>
            <Image
              source={{ uri: item.uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              recyclingKey={item.id}
              transition={100}
            />
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="images-outline" size={52} color="#777" />
            <Text style={styles.emptyTitle}>No IntelliCam photos yet</Text>
            <Text style={styles.secondaryText}>Photos captured by IntelliCam will appear here.</Text>
          </View>
        }
        ListHeaderComponent={
          error ? (
            <View style={styles.errorBanner}>
              <Text selectable style={styles.errorText}>{error}</Text>
            </View>
          ) : null
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} color="white" /> : null}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
      />

      {selectedAsset && (
        <View style={styles.preview}>
          <FlatList
            key={`photo-preview-${width}`}
            data={assets}
            horizontal
            pagingEnabled
            disableIntervalMomentum
            initialScrollIndex={selectedAssetIndex}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            windowSize={3}
            keyExtractor={(asset) => asset.id}
            getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            onMomentumScrollEnd={handlePreviewSwipeEnd}
            onScrollBeginDrag={() => setPhotoMenuVisible(false)}
            showsHorizontalScrollIndicator={false}
            style={StyleSheet.absoluteFill}
            renderItem={({ item, index }) => (
              <View style={{ width, height: '100%' }}>
                <Image
                  accessibilityLabel={`Photo ${index + 1} of ${assets.length}`}
                  accessible
                  source={{ uri: item.uri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                  recyclingKey={item.id}
                />
              </View>
            )}
          />
          {photoMenuVisible && (
            <>
              <Pressable
                accessibilityLabel="Dismiss photo options"
                accessibilityRole="button"
                onPress={() => setPhotoMenuVisible(false)}
                style={StyleSheet.absoluteFill}
              />
              <View
                accessibilityViewIsModal
                style={[styles.photoMenu, { top: insets.top + 56 }]}
              >
                <Pressable
                  accessibilityHint="Shows capture settings, camera properties, and embedded location"
                  accessibilityLabel="Photo information"
                  accessibilityRole="button"
                  onPress={() => void openPhotoInformation()}
                  style={({ pressed }) => [
                    styles.photoMenuItem,
                    pressed && styles.photoMenuItemPressed,
                  ]}>
                  <Ionicons name="information-circle-outline" size={21} color="white" />
                  <Text style={styles.photoMenuText}>Information</Text>
                </Pressable>
                <View style={styles.photoMenuDivider} />
                <Pressable
                  accessibilityHint="Moves this photo to the device recycle bin after confirmation"
                  accessibilityLabel="Delete photo"
                  accessibilityRole="button"
                  accessibilityState={{
                    busy: deletingAssetId === selectedAsset.id,
                    disabled: Boolean(deletingAssetId),
                  }}
                  disabled={Boolean(deletingAssetId)}
                  onPress={confirmMoveToRecycleBin}
                  style={({ pressed }) => [
                    styles.photoMenuItem,
                    pressed && !deletingAssetId && styles.photoMenuItemPressed,
                  ]}>
                  {deletingAssetId === selectedAsset.id ? (
                    <ActivityIndicator color="#ff6b6b" />
                  ) : (
                    <Ionicons name="trash-outline" size={21} color="#ff6b6b" />
                  )}
                  <Text style={styles.photoMenuDeleteText}>Delete</Text>
                </Pressable>
              </View>
            </>
          )}
          <View
            pointerEvents="box-none"
            style={[styles.previewToolbar, { top: insets.top }]}
          >
            <Pressable
              accessibilityLabel="Back to gallery"
              accessibilityRole="button"
              hitSlop={8}
              onPress={closeSelectedPhoto}
              style={({ pressed }) => [
                styles.previewToolbarButton,
                pressed && styles.previewToolbarButtonPressed,
              ]}>
              <Ionicons name="chevron-back" size={28} color="white" />
            </Pressable>
            <Pressable
              accessibilityLabel="Photo options"
              accessibilityRole="button"
              accessibilityState={{
                expanded: photoMenuVisible,
                disabled: Boolean(deletingAssetId),
              }}
              disabled={Boolean(deletingAssetId)}
              hitSlop={8}
              onPress={() => setPhotoMenuVisible((visible) => !visible)}
              style={({ pressed }) => [
                styles.previewToolbarButton,
                pressed && styles.previewToolbarButtonPressed,
              ]}>
              <Ionicons name="ellipsis-horizontal" size={24} color="white" />
            </Pressable>
          </View>
        </View>
      )}

      <Modal
        animationType="slide"
        onRequestClose={() => setPhotoInfoVisible(false)}
        statusBarTranslucent
        transparent
        visible={photoInfoVisible}>
        <View style={styles.infoModal}>
          <Pressable
            accessibilityLabel="Close photo information"
            accessibilityRole="button"
            onPress={() => setPhotoInfoVisible(false)}
            style={styles.infoScrim}
          />
          <View
            accessibilityViewIsModal
            style={[styles.infoSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.infoHandle} />
            <View style={styles.infoHeader}>
              <View>
                <Text style={styles.infoTitle}>Photo information</Text>
                <Text style={styles.infoSubtitle}>{selectedAsset?.filename}</Text>
              </View>
              <Pressable
                accessibilityLabel="Close photo information"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setPhotoInfoVisible(false)}
                style={({ pressed }) => [
                  styles.infoCloseButton,
                  pressed && styles.photoMenuItemPressed,
                ]}>
                <Ionicons name="close" size={24} color="white" />
              </Pressable>
            </View>

            {photoInfoLoading ? (
              <View style={styles.infoLoading}>
                <ActivityIndicator color="white" />
                <Text style={styles.secondaryText}>Reading embedded photo data…</Text>
              </View>
            ) : photoInfoError ? (
              <View style={styles.infoError}>
                <Ionicons name="alert-circle-outline" size={28} color="#ffb4ab" />
                <Text selectable style={styles.infoErrorText}>{photoInfoError}</Text>
                <Pressable
                  accessibilityLabel="Retry loading photo information"
                  accessibilityRole="button"
                  onPress={() => void openPhotoInformation()}
                  style={({ pressed }) => [
                    styles.infoRetryButton,
                    pressed && styles.photoMenuItemPressed,
                  ]}>
                  <Text style={styles.infoRetryText}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.infoContent}
                showsVerticalScrollIndicator={false}>
                {photoInfoSections.map((section) => (
                  <View key={section.title} style={styles.infoSection}>
                    <Text style={styles.infoSectionTitle}>{section.title}</Text>
                    <View style={styles.infoSectionCard}>
                      {section.rows.map((item, index) => (
                        <View key={`${section.title}-${item.label}`}>
                          {index > 0 && <View style={styles.infoDivider} />}
                          <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>{item.label}</Text>
                            <Text selectable style={styles.infoValue}>{item.value}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#080808',
  },
  empty: {
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 30,
  },
  emptyTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryText: {
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
  },
  errorBanner: {
    padding: 12,
    backgroundColor: '#3b1717',
  },
  errorText: {
    color: '#ffb4ab',
    fontSize: 13,
    textAlign: 'center',
  },
  footer: {
    padding: 20,
  },
  preview: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'black',
  },
  previewToolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  previewToolbarButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: 'rgba(20,20,20,0.62)',
  },
  previewToolbarButtonPressed: {
    backgroundColor: 'rgba(50,50,50,0.82)',
  },
  photoMenu: {
    position: 'absolute',
    right: 12,
    minWidth: 168,
    padding: 6,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: '#242424',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  photoMenuItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderCurve: 'continuous',
  },
  photoMenuItemPressed: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  photoMenuText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  photoMenuDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  photoMenuDeleteText: {
    color: '#ff6b6b',
    fontSize: 16,
    fontWeight: '600',
  },
  infoModal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  infoScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  infoSheet: {
    maxHeight: '82%',
    minHeight: 320,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: '#181818',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  infoHandle: {
    width: 38,
    height: 4,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 2,
    backgroundColor: '#6f6f6f',
  },
  infoHeader: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  infoTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
  },
  infoSubtitle: {
    maxWidth: 260,
    marginTop: 3,
    color: '#a9a9a9',
    fontSize: 12,
  },
  infoCloseButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  infoLoading: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  infoError: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  infoErrorText: {
    color: '#ffb4ab',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  infoRetryButton: {
    minWidth: 96,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  infoRetryText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
  infoContent: {
    gap: 20,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  infoSection: {
    gap: 8,
  },
  infoSectionTitle: {
    paddingHorizontal: 4,
    color: '#a9a9a9',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  infoSectionCard: {
    overflow: 'hidden',
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: '#242424',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  infoRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoLabel: {
    flexShrink: 0,
    color: '#b7b7b7',
    fontSize: 14,
  },
  infoValue: {
    flex: 1,
    color: 'white',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  infoDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
});
