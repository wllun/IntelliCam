import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

import { PRESETS } from '@/constants/presets';

export interface CaptureModeOption {
  id: string;
  name: string;
  description: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  tint: string;
  tip: string;
  artwork: number;
}

const MODE_PRESENTATION: Record<
  string,
  Pick<CaptureModeOption, 'name' | 'description' | 'artwork'>
> = {
  star: {
    name: 'Star',
    description: 'Clearer night skies and stars',
    artwork: require('../assets/images/capture-modes/star.png'),
  },
  'light-trail': {
    name: 'Light Trail',
    description: 'Turn moving lights into flowing lines',
    artwork: require('../assets/images/capture-modes/light-trail.png'),
  },
  waterfall: {
    name: 'Waterfall',
    description: 'Smooth flowing water with scene detail',
    artwork: require('../assets/images/capture-modes/waterfall.png'),
  },
  portrait: {
    name: 'Portrait',
    description: 'Keep people crisp with gentle separation',
    artwork: require('../assets/images/capture-modes/portrait.png'),
  },
  product: {
    name: 'Product',
    description: 'Clean detail with controlled highlights',
    artwork: require('../assets/images/capture-modes/product.png'),
  },
};

export const NORMAL_CAPTURE_MODE: CaptureModeOption = {
  id: 'normal',
  name: 'Normal',
  description: 'Natural, automatic everyday photos',
  icon: 'camera-outline',
  tint: '#85B7EB',
  tip: 'Flash, zoom and photo size controls',
  artwork: require('../assets/images/capture-modes/normal.png'),
};

export const CAPTURE_MODES: CaptureModeOption[] = [
  NORMAL_CAPTURE_MODE,
  ...PRESETS.map((preset) => ({
    ...preset,
    ...MODE_PRESENTATION[preset.id],
  })),
];
