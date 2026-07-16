import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export interface Preset {
  id: string;
  name: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  tint: string;
  iso: number;
  shutter: string;
  whiteBalance: number;
  focus: 'auto' | 'infinity';
  raw: boolean;
  tip: string;
}

// ponytail: preset engine is this array for now; move to SQLite when custom presets land
export const PRESETS: Preset[] = [
  {
    id: 'star',
    name: 'Star photography',
    icon: 'moon-outline',
    tint: '#9FE1CB',
    iso: 3200,
    shutter: '15s',
    whiteBalance: 4000,
    focus: 'infinity',
    raw: true,
    tip: 'Place phone on tripod',
  },
  {
    id: 'light-trail',
    name: 'Light trail',
    icon: 'car-outline',
    tint: '#FAC775',
    iso: 100,
    shutter: '4s',
    whiteBalance: 5000,
    focus: 'auto',
    raw: true,
    tip: 'Keep the camera perfectly still',
  },
  {
    id: 'waterfall',
    name: 'Waterfall',
    icon: 'water-outline',
    tint: '#85B7EB',
    iso: 50,
    shutter: '1s',
    whiteBalance: 5500,
    focus: 'auto',
    raw: true,
    tip: 'Use a tripod or brace against something solid',
  },
  {
    id: 'portrait',
    name: 'Portrait',
    icon: 'person-outline',
    tint: '#F4C0D1',
    iso: 200,
    shutter: '1/120',
    whiteBalance: 5200,
    focus: 'auto',
    raw: false,
    tip: 'Stand 1–2 m from your subject',
  },
  {
    id: 'product',
    name: 'Product',
    icon: 'cube-outline',
    tint: '#CECBF6',
    iso: 100,
    shutter: '1/60',
    whiteBalance: 5600,
    focus: 'auto',
    raw: false,
    tip: 'Use soft, even lighting on the item',
  },
];
