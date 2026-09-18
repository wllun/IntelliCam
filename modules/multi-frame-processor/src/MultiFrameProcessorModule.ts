import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { ComputationalMode, FrameRegistration, FrameSceneMeasurement, LiveCaptureScene } from '../../../types/adaptive-capture';

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
  analyzePreviewAsync(sourceUri: string, sceneKey: string, sampledAt: number): Promise<Pick<LiveCaptureScene,
    'meanLuma' | 'highlightFraction' | 'texture' | 'subjectMotion' | 'lightMotion' | 'lightSpeed' | 'displacement'>>;
  sampleMotionAsync(): Promise<Pick<LiveCaptureScene, 'gyroRms' | 'gyroSamples'>>;
  measureAsync(sourceUri: string): Promise<FrameSceneMeasurement>;
  processAsync(
    sourceUris: string[],
    mode: MultiFrameMode,
    jpegQuality: number,
  ): Promise<MultiFrameProcessResult>;
}

export default requireOptionalNativeModule<MultiFrameProcessorModule>('MultiFrameProcessor');
