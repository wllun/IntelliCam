import { NativeModule, requireOptionalNativeModule } from 'expo';

export type MultiFrameMode = 'star' | 'light-trail' | 'waterfall';

export interface MultiFrameAlignment {
  index: number;
  offsetX: number;
  offsetY: number;
  motionScore: number;
  accepted: boolean;
}

export interface MultiFrameProcessResult {
  uri: string;
  applied: boolean;
  inputFrameCount: number;
  acceptedFrameCount: number;
  rejectedFrameCount: number;
  alignments: MultiFrameAlignment[];
}

declare class MultiFrameProcessorModule extends NativeModule {
  processAsync(
    sourceUris: string[],
    mode: MultiFrameMode,
    jpegQuality: number,
  ): Promise<MultiFrameProcessResult>;
}

export default requireOptionalNativeModule<MultiFrameProcessorModule>('MultiFrameProcessor');
