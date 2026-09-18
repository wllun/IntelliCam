import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import type { CameraRef } from 'react-native-vision-camera';
import type { Image } from 'react-native-nitro-image';
import MultiFrameProcessor from '@/modules/multi-frame-processor';
import type { LiveCaptureScene } from '@/types/adaptive-capture';
import { unavailableLiveScene } from '@/utils/environment-capture.mjs';

/** At most one tiny sample in flight; no React state updates or extra photo output. */
export function useLiveCaptureScene(
  cameraRef: RefObject<CameraRef | null>, enabled: boolean, paused: boolean, sceneKey: string,
) {
  const current = useRef({ enabled, paused, sceneKey });
  current.current = { enabled, paused, sceneKey };
  const latest = useRef<LiveCaptureScene>(unavailableLiveScene());
  const latestKey = useRef<string | undefined>(undefined);
  const pending = useRef<{ key: string; promise: Promise<LiveCaptureScene> } | null>(null);

  const sample = useCallback((): Promise<LiveCaptureScene> => {
    const key = current.current.sceneKey;
    if (pending.current) {
      // A stale scene's request must finish before another starts; never share its result.
      return pending.current.key === key ? pending.current.promise
        : Promise.resolve(unavailableLiveScene('scene-changed'));
    }
    if (!current.current.enabled) return Promise.resolve(unavailableLiveScene('camera-inactive'));
    const promise = (async () => {
      const measured = unavailableLiveScene();
      const started = Date.now();
      measured.sampledAt = started;
      let snapshot: Image | undefined;
      let small: Image | undefined;
      let path: string | undefined;
      const motion = typeof MultiFrameProcessor?.sampleMotionAsync === 'function'
        ? MultiFrameProcessor.sampleMotionAsync().catch(() => ({ gyroRms: null, gyroSamples: 0 }))
        : Promise.resolve({ gyroRms: null, gyroSamples: 0 });
      try {
        const camera = cameraRef.current;
        if (Platform.OS === 'android' && camera && typeof MultiFrameProcessor?.analyzePreviewAsync === 'function') {
          snapshot = await camera.takeSnapshot();
          small = await snapshot.resizeAsync(128, 96);
          path = await small.saveToTemporaryFileAsync('jpg', 95);
          Object.assign(measured, await MultiFrameProcessor.analyzePreviewAsync(path, key, started));
          measured.source = 'preview-snapshot';
          delete measured.reason;
        } else {
          measured.source = 'metering-only';
          measured.reason = Platform.OS === 'ios' ? 'ios-preview-snapshot-unavailable' : 'native-analysis-unavailable';
        }
        try {
          const controller = camera?.controller;
          const duration = controller?.exposureDuration;
          const iso = controller?.iso;
          measured.meteredExposureSeconds = duration && duration > 0 && Number.isFinite(duration) ? duration : null;
          measured.meteredISO = iso && iso > 0 && Number.isFinite(iso) ? iso : null;
        } catch { /* Unsupported controller getters are explicitly unknown. */ }
      } catch {
        measured.reason = 'preview-analysis-failed';
      } finally {
        Object.assign(measured, await motion);
        try {
          if (small !== snapshot) small?.dispose();
          snapshot?.dispose();
        } catch { /* A lost camera context must not reject the sampling loop. */ }
        if (path) {
          try { const file = new File(path); if (file.exists) file.delete(); } catch { /* cache cleanup */ }
        }
      }
      if (!current.current.enabled || current.current.sceneKey !== key) return unavailableLiveScene('scene-changed');
      latest.current = measured;
      latestKey.current = key;
      return measured;
    })();
    pending.current = { key, promise };
    const clearPending = () => { if (pending.current?.promise === promise) pending.current = null; };
    void promise.then(clearPending, clearPending);
    return promise;
  }, [cameraRef]);

  useEffect(() => {
    latest.current = unavailableLiveScene('scene-changed');
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!current.current.paused) await sample().catch(() => unavailableLiveScene('analysis-failed'));
      if (!stopped) timer = setTimeout(tick, 750);
    };
    void tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [enabled, sample, sceneKey]);

  const getAtShutter = useCallback(async () => {
    if (current.current.enabled && latestKey.current === current.current.sceneKey
      && Date.now() - latest.current.sampledAt < 500) return { ...latest.current };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([sample().catch(() => unavailableLiveScene('analysis-failed')), new Promise<LiveCaptureScene>((resolve) => {
        timer = setTimeout(() => resolve(unavailableLiveScene('analysis-time-budget-exceeded')), 1000);
      })]);
    } finally { clearTimeout(timer); }
  }, [sample]);
  return { getAtShutter };
}
