import type { ItemDefinition, ItemId } from '../types';

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinition> = {
  dirt: { id: 'dirt', label: 'Erde', category: 'resource', value: 0, stackSize: 999 },
  sand: { id: 'sand', label: 'Sand', category: 'resource', value: 1, stackSize: 999 },
  clay: { id: 'clay', label: 'Lehm', category: 'resource', value: 1, stackSize: 999 },
  gravel: { id: 'gravel', label: 'Kies', category: 'resource', value: 1, stackSize: 999 },
  stone: { id: 'stone', label: 'Stein', category: 'resource', value: 1, stackSize: 999 },
  basalt: { id: 'basalt', label: 'Basalt', category: 'resource', value: 3, stackSize: 999 },
  copper: { id: 'copper', label: 'Kupfer', category: 'resource', value: 3, stackSize: 999 },
  iron: { id: 'iron', label: 'Eisen', category: 'resource', value: 5, stackSize: 999 },
  gold: { id: 'gold', label: 'Gold', category: 'resource', value: 25, stackSize: 999 },
  diamond: { id: 'diamond', label: 'Diamant', category: 'resource', value: 100, stackSize: 999 },
  energy_cell: { id: 'energy_cell', label: 'Energie-Zelle', category: 'consumable', value: 30, stackSize: 20 },
  repair_kit: { id: 'repair_kit', label: 'Repair-Kit', category: 'consumable', value: 40, stackSize: 20 },
  teleport_bracelet: { id: 'teleport_bracelet', label: 'Teleport-Armband', category: 'consumable', value: 200, stackSize: 5 },
};
