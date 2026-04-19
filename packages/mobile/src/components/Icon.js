// components/Icon.js — Central Feather icon component with source/status mappings
import { Feather } from '@expo/vector-icons';
import { colors } from '../styles/theme';

// Source-type → Feather icon name + accent colour
export const SOURCE_ICONS = {
  task:        { icon: 'clipboard',     accent: colors.primary },
  maintenance: { icon: 'tool',          accent: '#E67E22' },
  calibration: { icon: 'sliders',       accent: '#8E44AD' },
  risk_action: { icon: 'alert-triangle',accent: '#E74C3C' },
  incident:    { icon: 'alert-octagon', accent: colors.danger },
  observation: { icon: 'search',        accent: colors.success },
  block:       { icon: 'grid',          accent: colors.primary },
  asset:       { icon: 'package',       accent: colors.primary },
};

// Observation-category → icon
export const OBS_CATEGORY_ICONS = {
  phenology:   'git-branch',
  disease:     'activity',
  yield:       'trending-up',
  environment: 'cloud-drizzle',
  other:       'edit-3',
};

// Asset-category → icon
export const ASSET_CATEGORY_ICONS = {
  all:            'package',
  equipment:      'settings',
  vehicle:        'truck',
  infrastructure: 'home',
  consumable:     'droplet',
  tool:           'tool',
};

export default function Icon({ name, size = 20, color = colors.text, style }) {
  return <Feather name={name} size={size} color={color} style={style} />;
}
