import { requireOptionalNativeModule } from 'expo-modules-core';

export interface StarStackResult {
  uri: string;
  frameCount: number;
}

interface StarProcessorModule {
  stackAverageAsync(sourceUris: string[], jpegQuality: number): Promise<StarStackResult>;
}

export default requireOptionalNativeModule<StarProcessorModule>('StarProcessor');
