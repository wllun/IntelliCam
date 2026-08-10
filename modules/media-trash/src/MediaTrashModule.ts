import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class MediaTrashModule extends NativeModule {
  readonly isSupported: boolean;
  trashAssetAsync(assetId: string): Promise<boolean>;
}

export default requireOptionalNativeModule<MediaTrashModule>('MediaTrash');
