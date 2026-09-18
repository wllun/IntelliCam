import { NativeModule, requireOptionalNativeModule } from 'expo';

export interface PortraitEffectResult {
  uri: string;
  applied: boolean;
}

declare class PortraitEffectModule extends NativeModule {
  subjectSegmentationVersion: number;
  prepareAsync(): Promise<boolean>;
  previewMaskAsync(sourceUri: string, focusX: number, focusY: number): Promise<PortraitEffectResult>;
  applyAsync(sourceUri: string, jpegQuality: number, focusX: number, focusY: number): Promise<PortraitEffectResult>;
  applyBeautyAsync(sourceUri: string, jpegQuality: number): Promise<PortraitEffectResult>;
}

export default requireOptionalNativeModule<PortraitEffectModule>('PortraitEffect');
