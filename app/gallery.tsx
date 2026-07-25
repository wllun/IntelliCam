import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ALBUM_NAME = 'IntelliCam';
const PAGE_SIZE = 60;
const GRID_GAP = 2;

export default function GalleryScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<MediaLibrary.Asset | null>(null);
  const [endCursor, setEndCursor] = useState<string>();
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
        resolveWithFullInfo: true,
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
        resolveWithFullInfo: true,
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
            onPress={() => setSelectedAsset(item)}
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
          <Pressable
            accessibilityLabel="Close photo"
            accessibilityRole="button"
            onPress={() => setSelectedAsset(null)}
            style={[styles.closeButton, { top: insets.top + 14 }]}>
            <Ionicons name="close" size={28} color="white" />
          </Pressable>
          <View style={[styles.photoInfo, { bottom: insets.bottom + 18 }]}>
            <Text selectable numberOfLines={1} style={styles.filename}>{selectedAsset.filename}</Text>
            <Text style={styles.secondaryText}>
              {selectedAsset.width} × {selectedAsset.height}
            </Text>
          </View>
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
  closeButton: {
    position: 'absolute',
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,20,20,0.72)',
  },
  photoInfo: {
    position: 'absolute',
    left: 18,
    right: 18,
    alignItems: 'center',
    gap: 4,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(20,20,20,0.72)',
  },
  filename: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
