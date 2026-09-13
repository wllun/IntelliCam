import { NativeModule, requireOptionalNativeModule } from 'expo';

export interface PortraitEffectResult {
  uri: string;
  applied: boolean;
}

declare class PortraitEffectModule extends NativeModule {
  applyAsync(sourceUri: string, jpegQuality: number): Promise<PortraitEffectResult>;
}

export default requireOptionalNativeModule<PortraitEffectModule>('PortraitEffect');
