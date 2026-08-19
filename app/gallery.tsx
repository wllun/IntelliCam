import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
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

import MediaTrash from '@/modules/media-trash';

const ALBUM_NAME = 'IntelliCam';
const PAGE_SIZE = 60;
const GRID_GAP = 2;

export default function GalleryScreen() {
  const { width } = useWindowDimensions();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<MediaLibrary.Asset | null>(null);
  const [photoMenuVisible, setPhotoMenuVisible] = useState(false);
  const [endCursor, setEndCursor] = useState<string>();
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string>();
  const [error, setError] = useState<string>();
  const itemSize = (width - GRID_GAP * 2) / 3;

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
      if (photoMenuVisible) {
        setPhotoMenuVisible(false);
      } else {
        setSelectedAsset(null);
      }
      return true;
    });

    return () => subscription.remove();
  }, [photoMenuVisible, selectedAsset]);

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

  const closeSelectedPhoto = () => {
    setPhotoMenuVisible(false);
    setSelectedAsset(null);
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
          headerBackVisible: selectedAsset ? false : true,
          headerLeft: selectedAsset
            ? () => (
                <Pressable
                  accessibilityLabel="Back to gallery"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={closeSelectedPhoto}
                  style={({ pressed }) => [
                    styles.headerIconButton,
                    pressed && styles.headerIconButtonPressed,
                  ]}>
                  <Ionicons name="chevron-back" size={28} color="white" />
                </Pressable>
              )
            : undefined,
          headerRight: selectedAsset
            ? () => (
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
                    styles.headerIconButton,
                    pressed && styles.headerIconButtonPressed,
                  ]}>
                  <Ionicons name="ellipsis-horizontal" size={24} color="white" />
                </Pressable>
              )
            : undefined,
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
          <Image source={{ uri: selectedAsset.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
          {photoMenuVisible && (
            <>
              <Pressable
                accessibilityLabel="Dismiss photo options"
                accessibilityRole="button"
                onPress={() => setPhotoMenuVisible(false)}
                style={StyleSheet.absoluteFill}
              />
              <View accessibilityViewIsModal style={styles.photoMenu}>
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
        </View>
      )}
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
  headerIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconButtonPressed: {
    opacity: 0.62,
  },
  photoMenu: {
    position: 'absolute',
    top: 8,
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
  photoMenuDeleteText: {
    color: '#ff6b6b',
    fontSize: 16,
    fontWeight: '600',
  },
});
