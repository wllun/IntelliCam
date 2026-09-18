import { useEffect, useMemo, type RefObject } from 'react';
import { Platform } from 'react-native';
import { type CameraDevice, type CameraRef, type Constraint, usePhotoOutput } from 'react-native-vision-camera';

import MultiFrameProcessor from '@/modules/multi-frame-processor';
import PortraitEffect from '@/modules/portrait-effect';
import { getPhotoCaptureSettings, getPhotoOutputOptions, readCameraCapabilities } from '@/services/capture-preparation';
import type { CaptureFlashMode, PhotoQuality } from '@/types/adaptive-capture';

/** Owns native preparation; screen owns lifecycle, timer and UI only. */
export function useCapturePreparation(
  device: CameraDevice | undefined,
  cameraRef: RefObject<CameraRef | null>,
  cameraReady: boolean,
  photoQuality: PhotoQuality,
  hdrEnabled: boolean,
) {
  const capabilities = useMemo(() => readCameraCapabilities(device, Platform.OS, {
    multiFrame: Boolean(MultiFrameProcessor),
    portrait: Boolean(PortraitEffect),
    sceneMeasurement: typeof MultiFrameProcessor?.measureAsync === 'function',
  }), [device]);
  const supportsNativeHdr = capabilities.photoHDR;
  const nativeHdrRequested = hdrEnabled && supportsNativeHdr;
  const photoOutput = usePhotoOutput(getPhotoOutputOptions(photoQuality, nativeHdrRequested));
  const cameraOutputs = useMemo(() => [photoOutput], [photoOutput]);
  const cameraConstraints = useMemo<Constraint[]>(() => [
    { photoHDR: nativeHdrRequested }, { resolutionBias: photoOutput },
  ], [nativeHdrRequested, photoOutput]);

  useEffect(() => {
    if (!cameraReady || !device) return;
    const modes: CaptureFlashMode[] = capabilities.flash ? ['off', 'auto', 'on'] : ['off'];
    const settings = modes.flatMap((mode) => [false, true].flatMap((sound) => {
      const normal = getPhotoCaptureSettings(capabilities, photoQuality, nativeHdrRequested, mode, sound);
      // Include the exact no-flash variants used by motion composites and special modes.
      return mode === 'off' ? [normal, { ...normal, enableRedEyeReduction: false },
        { ...normal, enableRedEyeReduction: false, enableVirtualDeviceFusion: false }] : [normal];
    }));
    void photoOutput.prepareSettings(settings).catch(() => undefined);
  }, [cameraReady, capabilities, device, nativeHdrRequested, photoOutput, photoQuality]);

  useEffect(() => {
    if (!cameraReady || !device) return;
    const controller = cameraRef.current?.controller;
    if (!controller) return;
    void controller.configure({
      enableLowLightBoost: capabilities.lowLightBoost ? photoQuality === 'maximum' : undefined,
      enableDistortionCorrection: capabilities.distortionCorrection ? photoQuality === 'maximum' : undefined,
    }).catch((error: unknown) => console.warn('Could not prepare camera enhancements:', error));
  }, [cameraReady, cameraRef, capabilities, device, photoQuality]);

  return { capabilities, supportsNativeHdr, nativeHdrRequested, photoOutput, cameraOutputs, cameraConstraints };
}
