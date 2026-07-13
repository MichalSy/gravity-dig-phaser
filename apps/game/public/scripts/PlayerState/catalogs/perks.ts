import type { PerkDefinition, PerkId } from '../types';

export const PERK_DEFINITIONS: Record<PerkId, PerkDefinition> = {
  magnet_core: {
    id: 'magnet_core',
    label: 'Magnet-Kern',
    source: 'artifact',
    effects: [],
  },
  luck_amulet: {
    id: 'luck_amulet',
    label: 'Glücks-Amulett',
    source: 'artifact',
    effects: [],
  },
  energy_artifact: {
    id: 'energy_artifact',
    label: 'Energie-Zelle',
    source: 'artifact',
    effects: [{ stat: 'energyCostPerSec', op: 'multiply', value: 0.8 }],
  },
  double_drop: {
    id: 'double_drop',
    label: 'Doppelgänger',
    source: 'artifact',
    effects: [],
  },
  phoenix_feather: {
    id: 'phoenix_feather',
    label: 'Phoenix-Feder',
    source: 'artifact',
    effects: [],
  },
};
