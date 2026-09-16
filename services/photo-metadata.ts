import type * as MediaLibrary from 'expo-media-library';
import type { CapturePlan } from '@/types/adaptive-capture';

import PhotoMetadata, {
  type EmbeddedPhotoMetadata,
} from '@/modules/photo-metadata';

export interface CapturePhotoMetadata {
  schemaVersion: 1;
  capturedAt: string;
  captureMode: string;
  captureModeId: string;
  aspectRatio: string;
  zoom: number;
  facing: 'front' | 'back';
  cameraName?: string;
  cameraModel?: string;
  cameraType?: string;
  flash: string;
  hdr: boolean;
  photoQuality: 'standard' | 'maximum';
  exposureCompensation: number;
  focusExposureLocked: boolean;
  timerSeconds: number;
  locationSaved: boolean;
  portraitEffectRequested?: boolean;
  portraitEffectApplied?: boolean;
  multiFrameRequested?: boolean;
  multiFrameApplied?: boolean;
  inputFrameCount?: number;
  acceptedFrameCount?: number;
  rejectedFrameCount?: number;
  capturePlan?: CapturePlan;
  beautyEffectRequested?: boolean;
  beautyEffectApplied?: boolean;
  captureStrategy?:
    | 'manual-long-exposure'
    | 'manual-slow-exposure'
    | 'automatic-frame-stack'
    | 'automatic-lighten-composite'
    | 'automatic-temporal-average'
    | 'natural-beauty-processing'
    | 'locked-detail-capture'
    | 'automatic-detail-capture'
    | 'automatic-low-light';
  captureFrameCount?: number;
  manualExposureApplied?: boolean;
  appliedExposureSeconds?: number;
  appliedIso?: number;
  appliedWhiteBalanceKelvin?: number;
  focusStrategy?: 'infinity-locked' | 'automatic-locked';
  whiteBalanceStrategy?: 'manual-kelvin' | 'automatic-locked';
  processingOperations?: string[];
  captureFallbackReason?: string;
}

export interface CaptureLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
}

export interface PhotoInfoRow {
  label: string;
  value: string;
}

export interface PhotoInfoSection {
  title: string;
  rows: PhotoInfoRow[];
}

function text(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function rationalToNumber(value: string | undefined) {
  if (!value) return undefined;
  const [numerator, denominator] = value.split('/').map(Number);
  if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
    return numerator / denominator;
  }
  const direct = Number(value);
  return Number.isFinite(direct) ? direct : undefined;
}

function formatExposureTime(value: string | undefined) {
  const seconds = rationalToNumber(value);
  if (!seconds || seconds <= 0) return text(value);
  if (seconds < 1) return `1/${Math.round(1 / seconds)} s`;
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
}

function parseCustomMetadata(value: string | undefined): CapturePhotoMetadata | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as CapturePhotoMetadata;
    return parsed?.schemaVersion === 1 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function rows(values: (PhotoInfoRow | undefined)[]) {
  return values.filter((row): row is PhotoInfoRow => Boolean(row?.value));
}

function row(label: string, value: unknown): PhotoInfoRow | undefined {
  const normalized = text(value);
  return normalized ? { label, value: normalized } : undefined;
}

function formatCaptureStrategy(value: CapturePhotoMetadata['captureStrategy']) {
  switch (value) {
    case 'manual-long-exposure':
      return 'Manual long exposure';
    case 'manual-slow-exposure':
      return 'Manual slow exposure';
    case 'automatic-frame-stack':
      return 'Automatic frame stack';
    case 'automatic-lighten-composite':
      return 'Automatic light trail composite';
    case 'automatic-temporal-average':
      return 'Automatic temporal average';
    case 'natural-beauty-processing':
      return 'Natural beauty processing';
    case 'locked-detail-capture':
      return 'Locked detail capture';
    case 'automatic-detail-capture':
      return 'Automatic detail capture';
    case 'automatic-low-light':
      return 'Automatic low light';
    default:
      return undefined;
  }
}

export async function embedPhotoMetadata(
  sourceUri: string,
  targetUri: string,
  metadata: CapturePhotoMetadata,
  location?: CaptureLocation,
) {
  if (!PhotoMetadata) return false;
  await PhotoMetadata.writeMetadataAsync(
    sourceUri,
    targetUri,
    JSON.stringify(metadata),
    location?.latitude,
    location?.longitude,
    location?.altitude,
  );
  return true;
}

export async function getPhotoInformation(
  asset: MediaLibrary.Asset,
  assetInfo: MediaLibrary.AssetInfo,
): Promise<PhotoInfoSection[]> {
  const mediaExif = (assetInfo.exif ?? {}) as Record<string, unknown>;
  let embedded: EmbeddedPhotoMetadata = {};
  const readableUri = assetInfo.localUri ?? asset.uri;
  if (PhotoMetadata && readableUri) {
    try {
      embedded = await PhotoMetadata.readMetadataAsync(readableUri);
    } catch (error) {
      console.warn('Could not read embedded photo metadata:', error);
    }
  }
  embedded = {
    customMetadata: embedded.customMetadata ?? text(mediaExif.UserComment),
    make: embedded.make ?? text(mediaExif.Make),
    model: embedded.model ?? text(mediaExif.Model),
    dateTimeOriginal: embedded.dateTimeOriginal ?? text(mediaExif.DateTimeOriginal),
    exposureTime: embedded.exposureTime ?? text(mediaExif.ExposureTime),
    fNumber: embedded.fNumber ?? text(mediaExif.FNumber),
    iso: embedded.iso ?? text(mediaExif.ISOSpeedRatings ?? mediaExif.PhotographicSensitivity),
    focalLength: embedded.focalLength ?? text(mediaExif.FocalLength),
    lensModel: embedded.lensModel ?? text(mediaExif.LensModel),
    digitalZoomRatio: embedded.digitalZoomRatio ?? text(mediaExif.DigitalZoomRatio),
    exposureBias: embedded.exposureBias ?? text(mediaExif.ExposureBiasValue),
    latitude: embedded.latitude ?? assetInfo.location?.latitude,
    longitude: embedded.longitude ?? assetInfo.location?.longitude,
    altitude: embedded.altitude,
  };
  const custom = parseCustomMetadata(embedded.customMetadata);
  const plan = custom?.capturePlan?.version === 1 ? custom.capturePlan : undefined;
  const clipped = plan?.scene?.highlightClipping?.fraction;
  const displacement = plan?.scene?.stability?.displacementFraction;
  const capturedAt = custom?.capturedAt
    ? new Date(custom.capturedAt)
    : new Date(asset.creationTime);
  const iso = Array.isArray(embedded.iso) ? embedded.iso.join(', ') : embedded.iso;
  const aperture = rationalToNumber(embedded.fNumber);
  const focalLength = rationalToNumber(embedded.focalLength);
  const coordinates = embedded.latitude !== undefined && embedded.longitude !== undefined
    ? `${embedded.latitude.toFixed(6)}, ${embedded.longitude.toFixed(6)}`
    : undefined;

  return [
    {
      title: 'Photo',
      rows: rows([
        row('File', asset.filename),
        row('Captured', Number.isNaN(capturedAt.getTime()) ? undefined : capturedAt.toLocaleString()),
        row('Dimensions', `${asset.width} × ${asset.height}`),
        row('Media type', asset.mediaType),
      ]),
    },
    {
      title: 'IntelliCam',
      rows: rows([
        row('Capture mode', custom?.captureMode),
        row('Capture strategy', formatCaptureStrategy(custom?.captureStrategy)),
        row('Frames combined', custom?.captureFrameCount && custom.captureFrameCount > 1
          ? custom.captureFrameCount
          : undefined),
        row('Manual exposure', custom?.manualExposureApplied && custom.appliedExposureSeconds
          ? `${custom.appliedExposureSeconds.toFixed(1)} s at ISO ${custom.appliedIso}`
          : undefined),
        row('White balance', custom?.appliedWhiteBalanceKelvin
          ? `${custom.appliedWhiteBalanceKelvin} K`
          : custom?.whiteBalanceStrategy === 'automatic-locked' ? 'Automatic locked' : undefined),
        row('Capture focus', custom?.focusStrategy === 'infinity-locked'
          ? 'Infinity locked'
          : custom?.focusStrategy === 'automatic-locked' ? 'Automatic metering lock' : undefined),
        row('Processing', custom?.processingOperations?.join(', ')),
        row('Fallback', custom?.captureFallbackReason),
        row('Aspect ratio', custom?.aspectRatio),
        row('Zoom', custom ? `${custom.zoom.toFixed(1)}×` : undefined),
        row('Photo quality', custom?.photoQuality === 'maximum' ? 'Maximum' : custom?.photoQuality === 'standard' ? 'Standard' : undefined),
        row('Camera', custom?.cameraName ?? custom?.cameraType),
        row('Facing', custom ? custom.facing[0].toUpperCase() + custom.facing.slice(1) : undefined),
        row('Flash', custom ? custom.flash[0].toUpperCase() + custom.flash.slice(1) : undefined),
        row('HDR', custom ? custom.hdr ? 'Applied' : plan?.requested?.hdr ? 'Not applied' : 'Off' : undefined),
        row('Portrait effect', custom?.portraitEffectRequested
          ? custom.portraitEffectApplied ? 'Applied' : 'Not applied'
          : custom ? 'Off' : undefined),
        row('Multi-frame processing', custom?.multiFrameRequested
          ? custom.multiFrameApplied ? 'Applied' : 'Not applied'
          : custom ? 'Off' : undefined),
        row('Frames used', custom?.multiFrameRequested && custom.inputFrameCount !== undefined
          ? `${custom.acceptedFrameCount ?? 1} of ${custom.inputFrameCount}`
          : undefined),
        row('Frames rejected', custom?.multiFrameRequested && custom.rejectedFrameCount
          ? custom.rejectedFrameCount
          : undefined),
        row('Beauty effect', custom?.beautyEffectRequested
          ? custom.beautyEffectApplied ? 'Applied' : 'Not applied'
          : undefined),
        row('Exposure compensation', custom ? `${custom.exposureCompensation >= 0 ? '+' : ''}${custom.exposureCompensation.toFixed(1)} EV` : undefined),
        row('Focus / exposure lock', custom ? custom.focusExposureLocked ? 'Locked' : 'Automatic' : undefined),
        row('Timer', custom ? custom.timerSeconds ? `${custom.timerSeconds} s` : 'Off' : undefined),
      ]),
    },
    {
      title: 'Capture engine',
      rows: rows([
        row('Requested HDR', plan?.requested ? plan.requested.hdr ? 'On' : 'Off' : undefined),
        row('Resolved processing', plan?.resolved?.processing),
        row('Applied processing', plan?.applied?.processing),
        row('Planned frames', plan?.resolved?.frameCount),
        row('Applied frames', plan?.applied?.frameCount),
        row('Native zoom at shutter', plan?.applied?.native?.zoom),
        row('Native exposure bias', plan?.applied?.native?.exposureBias != null
          ? `${plan.applied.native.exposureBias} ${plan.applied.native.exposureBiasUnit}` : undefined),
        row('Highlight clipping', typeof clipped === 'number' && Number.isFinite(clipped)
          ? `${(clipped * 100).toFixed(1)}% of sampled JPEG pixels` : plan ? 'Unknown' : undefined),
        row('Stability', plan?.scene?.stability?.status),
        row('Maximum displacement', typeof displacement === 'number' && Number.isFinite(displacement)
          ? `${(displacement * 100).toFixed(2)}% of frame` : undefined),
        ...(Array.isArray(plan?.fallbacks) ? plan.fallbacks.slice(0, 12).map((item) =>
          row(`Fallback · ${item?.setting ?? 'capture'}`, typeof item?.reason === 'string'
            ? item.reason.replace(/-/g, ' ') : undefined)) : []),
      ]),
    },
    {
      title: 'Camera EXIF',
      rows: rows([
        row('Device', [embedded.make, embedded.model].filter(Boolean).join(' ')),
        row('Lens', embedded.lensModel),
        row('ISO', iso),
        row('Shutter', formatExposureTime(embedded.exposureTime)),
        row('Aperture', aperture ? `ƒ/${aperture.toFixed(1)}` : undefined),
        row('Focal length', focalLength ? `${focalLength.toFixed(1)} mm` : undefined),
      ]),
    },
    {
      title: 'Location',
      rows: rows([
        row('Coordinates', coordinates),
        row('Altitude', embedded.altitude !== undefined ? `${embedded.altitude.toFixed(1)} m` : undefined),
      ]),
    },
  ].filter((section) => section.rows.length > 0);
}
