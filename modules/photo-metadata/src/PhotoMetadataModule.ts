import { NativeModule, requireOptionalNativeModule } from 'expo';

export interface EmbeddedPhotoMetadata {
  customMetadata?: string;
  make?: string;
  model?: string;
  dateTimeOriginal?: string;
  exposureTime?: string;
  fNumber?: string;
  iso?: string;
  focalLength?: string;
  lensModel?: string;
  digitalZoomRatio?: string;
  exposureBias?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
}

declare class PhotoMetadataModule extends NativeModule {
  writeMetadataAsync(
    sourceUri: string,
    targetUri: string,
    metadataJson: string,
    latitude?: number,
    longitude?: number,
    altitude?: number,
  ): Promise<void>;
  readMetadataAsync(uri: string): Promise<EmbeddedPhotoMetadata>;
}

export default requireOptionalNativeModule<PhotoMetadataModule>('PhotoMetadata');
