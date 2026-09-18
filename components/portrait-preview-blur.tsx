import { memo, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
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
}: PortraitPreviewBlurProps) {
  const [maskUri, setMaskUri] = useState<string>();
  const running = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let nextFrame: ReturnType<typeof setTimeout>;
    let expiration: ReturnType<typeof setTimeout>;
    const retainedFiles: string[] = [];
    setMaskUri(undefined);

    async function updateMask() {
      // Single-flight, including a previous scene's request still completing.
      if (running.current) {
        nextFrame = setTimeout(updateMask, 80);
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
        const result = await PortraitEffect!.previewMaskAsync(inputPath, focusX, focusY);
        resultPath = result.uri || undefined;
        if (cancelled) return;
        clearTimeout(expiration);
        if (Date.now() - startedAt > 1500) {
          setMaskUri(undefined);
          return;
        }
        setMaskUri(result.applied ? resultPath : undefined);
        if (resultPath) {
          retainedFiles.push(resultPath);
          resultPath = undefined;
          // Retain recent masks while Image loads their replacement.
          while (retainedFiles.length > 3) removeTemporaryFile(retainedFiles.shift()!);
          expiration = setTimeout(() => setMaskUri(undefined), 1200);
        }
      } catch {
        if (!cancelled) setMaskUri(undefined);
      } finally {
        if (inputPath) removeTemporaryFile(inputPath);
        if (resultPath) removeTemporaryFile(resultPath);
        if (small !== snapshot) small?.dispose();
        snapshot?.dispose();
        running.current = false;
        // Only masks are sampled; camera and background blur remain live.
        if (!cancelled) nextFrame = setTimeout(updateMask, 100);
      }
    }

    void updateMask();
    return () => {
      cancelled = true;
      clearTimeout(nextFrame);
      clearTimeout(expiration);
      retainedFiles.forEach(removeTemporaryFile);
    };
  }, [width, height, focusX, focusY, sceneKey, getSnapshot]);

  // No subject or stale detection: clear preview, never an invented sharp box.
  if (!maskUri) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <MaskedView
        style={{ width, height }}
        androidRenderingMode="software"
        maskElement={<Image source={{ uri: maskUri }} resizeMode="stretch" style={{ width, height }} />}>
        <BlurView intensity={75} tint="default" experimentalBlurMethod="dimezisBlurView"
          blurReductionFactor={2} style={StyleSheet.absoluteFill} />
      </MaskedView>
    </View>
  );
});
