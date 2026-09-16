import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { ComputationalMode, FrameRegistration, FrameSceneMeasurement } from '../../../types/adaptive-capture';

export type MultiFrameMode = ComputationalMode;

export type MultiFrameAlignment = FrameRegistration;

export interface MultiFrameProcessResult {
  uri: string;
  applied: boolean;
  inputFrameCount: number;
  acceptedFrameCount: number;
  rejectedFrameCount: number;
  alignments: MultiFrameAlignment[];
}

declare class MultiFrameProcessorModule extends NativeModule {
  measureAsync(sourceUri: string): Promise<FrameSceneMeasurement>;
  processAsync(
    sourceUris: string[],
    mode: MultiFrameMode,
    jpegQuality: number,
  ): Promise<MultiFrameProcessResult>;
}

export default requireOptionalNativeModule<MultiFrameProcessorModule>('MultiFrameProcessor');
