import { memo, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { File } from 'expo-file-system';
import type { Image as CameraImage } from 'react-native-nitro-image';
import PortraitEffect from '@/modules/portrait-effect';

interface PortraitPreviewBlurProps {
  width: number;
  height: number;
  focusX: number;
  focusY: number;
  sceneKey: string;
  getSnapshot: () => Promise<CameraImage>;
  onStatus: (status: string | undefined) => void;
}

function removeTemporaryFile(uri: string) {
  try {
    const file = new File(uri.startsWith('file://') ? uri : `file://${uri}`);
    if (file.exists) file.delete();
  } catch {
    // The operating system may already have removed a cache file.
  }
}

export const PortraitPreviewBlur = memo(function PortraitPreviewBlur({
  width,
  height,
  focusX,
  focusY,
  sceneKey,
  getSnapshot,
  onStatus,
}: PortraitPreviewBlurProps) {
  const [backgroundUri, setBackgroundUri] = useState<string>();
  const running = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let nextFrame: ReturnType<typeof setTimeout>;
    let expiration: ReturnType<typeof setTimeout>;
    const retainedFiles: string[] = [];
    let reportedError = false;
    setBackgroundUri(undefined);
    onStatus('Detecting Portrait subject…');

    async function updatePreview() {
      // Single-flight, including a previous scene's request still completing.
      if (running.current) {
        nextFrame = setTimeout(updatePreview, 80);
        return;
      }
      running.current = true;
      let snapshot: CameraImage | undefined;
      let small: CameraImage | undefined;
      let inputPath: string | undefined;
      let resultPath: string | undefined;
      const startedAt = Date.now();
      try {
        snapshot = await getSnapshot();
        if (cancelled) return;
        if (!Number.isFinite(snapshot.width) || !Number.isFinite(snapshot.height)
          || snapshot.width < 1 || snapshot.height < 1) {
          throw new Error('Portrait snapshot has no valid pixels');
        }
        // ML Kit recommends at least 512 pixels on both axes, including Full ratio.
        const scale = Math.min(1, Math.max(
          768 / Math.max(snapshot.width, snapshot.height),
          512 / Math.min(snapshot.width, snapshot.height),
        ));
        small = await snapshot.resizeAsync(
          Math.max(1, Math.round(snapshot.width * scale)),
          Math.max(1, Math.round(snapshot.height * scale)),
        );
        inputPath = await small.saveToTemporaryFileAsync('jpg', 85);
        if (cancelled) return;
        const result = await PortraitEffect!.previewBackgroundAsync(inputPath, focusX, focusY);
        resultPath = result.uri || undefined;
        if (cancelled) return;
        clearTimeout(expiration);
        if (Date.now() - startedAt > 4000) {
          setBackgroundUri(undefined);
          onStatus('Portrait preview is slow — hold still.');
          return;
        }
        reportedError = false;
        setBackgroundUri(result.applied ? resultPath : undefined);
        onStatus(result.applied ? undefined : 'No Portrait subject found — move closer or improve lighting.');
        if (resultPath) {
          retainedFiles.push(resultPath);
          resultPath = undefined;
          // Retain recent frames while Image loads their replacement.
          while (retainedFiles.length > 3) removeTemporaryFile(retainedFiles.shift()!);
          expiration = setTimeout(() => setBackgroundUri(undefined), 4000);
        }
      } catch (error) {
        if (!cancelled) {
          setBackgroundUri(undefined);
          onStatus('Portrait preview unavailable — saved-photo processing remains enabled.');
          if (!reportedError) console.warn('Portrait preview failed:', error);
          reportedError = true;
        }
      } finally {
        if (inputPath) removeTemporaryFile(inputPath);
        if (resultPath) removeTemporaryFile(resultPath);
        // A stopped/reconfigured camera can invalidate a native image. Cleanup
        // must not turn a handled preview error into an unhandled rejection.
        for (const image of [small !== snapshot ? small : undefined, snapshot]) {
          try { image?.dispose(); } catch { /* Already released native image. */ }
        }
        running.current = false;
        // Sample the background; the transparent subject stays on the live camera.
        if (!cancelled) nextFrame = setTimeout(updatePreview, 100);
      }
    }

    void updatePreview();
    return () => {
      cancelled = true;
      clearTimeout(nextFrame);
      clearTimeout(expiration);
      retainedFiles.forEach(removeTemporaryFile);
      onStatus(undefined);
    };
  }, [width, height, focusX, focusY, sceneKey, getSnapshot, onStatus]);

  // No subject or stale detection: clear preview, never an invented sharp box.
  if (!backgroundUri) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image source={{ uri: backgroundUri }} resizeMode="stretch" fadeDuration={0}
        style={{ width, height }} />
    </View>
  );
});
