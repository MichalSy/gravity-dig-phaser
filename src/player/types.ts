export type ItemId =
  | 'dirt'
  | 'sand'
  | 'clay'
  | 'gravel'
  | 'stone'
  | 'basalt'
  | 'copper'
  | 'iron'
  | 'gold'
  | 'diamond'
  | 'energy_cell'
  | 'repair_kit'
  | 'teleport_bracelet';

export type ItemCategory = 'resource' | 'consumable' | 'artifact';

export interface ItemDefinition {
  id: ItemId;
  label: string;
  category: ItemCategory;
  value: number;
  stackSize: number;
}

export interface InventoryState {
  capacity: number;
  items: Partial<Record<ItemId, number>>;
}

export type EquipmentSlot = 'laser' | 'visor' | 'battery' | 'boots' | 'coreDetector';

export type EquipmentId =
  | 'laser_mk1'
  | 'standard_visor'
  | 'standard_battery'
  | 'no_boots'
  | 'no_core_detector';

export interface EquipmentState {
  laser: EquipmentId;
  visor: EquipmentId;
  battery: EquipmentId;
  boots: EquipmentId;
  coreDetector: EquipmentId;
}

export type PlayerStatKey =
  | 'maxHealth'
  | 'maxEnergy'
  | 'energyRegenPerSec'
  | 'energyCostPerSec'
  | 'miningDamagePerSec'
  | 'miningRange'
  | 'moveSpeed'
  | 'jumpVelocity'
  | 'cargoCapacity'
  | 'sightRadius'
  | 'fuelEfficiency';

export interface StatModifier {
  stat: PlayerStatKey;
  op: 'add' | 'multiply' | 'set';
  value: number;
}

export type UpgradeId =
  | 'laser_mk2'
  | 'laser_mk3'
  | 'laser_mk4'
  | 'piercing_laser'
  | 'fast_laser'
  | 'auto_laser'
  | 'spectral_laser'
  | 'visor_mk1'
  | 'visor_mk2'
  | 'radar_visor'
  | 'quantum_visor'
  | 'battery_mk1'
  | 'battery_mk2'
  | 'battery_mk3'
  | 'battery_fusion'
  | 'boots_mk1'
  | 'boots_mk2'
  | 'boots_mk3'
  | 'boots_mk4'
  | 'core_compass'
  | 'core_scanner'
  | 'advanced_mapper'
  | 'cargo_mk1'
  | 'cargo_mk2'
  | 'cargo_mk3'
  | 'engine_mk1'
  | 'engine_mk2'
  | 'engine_mk3';

export interface Cost {
  credits?: number;
  items?: Partial<Record<ItemId, number>>;
}

export interface UpgradeDefinition {
  id: UpgradeId;
  label: string;
  category: 'laser' | 'visor' | 'battery' | 'boots' | 'core' | 'cargo' | 'ship';
  cost: Cost;
  effects: StatModifier[];
  prerequisites?: UpgradeId[];
}

export type PerkId =
  | 'magnet_core'
  | 'luck_amulet'
  | 'energy_artifact'
  | 'double_drop'
  | 'phoenix_feather';

export interface PerkDefinition {
  id: PerkId;
  label: string;
  source: 'artifact' | 'upgrade' | 'temporary';
  effects: StatModifier[];
}

export interface PerkState {
  unlocked: PerkId[];
  equipped: PerkId[];
}

export interface UpgradeState {
  purchased: UpgradeId[];
}

export interface LifetimeStats {
  runsStarted: number;
  runsCompleted: number;
  deaths: number;
  blocksMined: number;
  resourcesMined: number;
  creditsEarned: number;
  deepestTileReached: number;
}

export interface PlayerProfile {
  version: 1;
  credits: number;
  inventory: InventoryState;
  equipment: EquipmentState;
  upgrades: UpgradeState;
  perks: PerkState;
  unlockedPlanets: string[];
  stats: LifetimeStats;
}

export interface ActiveEffect {
  id: string;
  label: string;
  remainingMs: number;
  effects: StatModifier[];
}

export interface RunState {
  planetId: string;
  seed: string;
  health: number;
  energy: number;
  fuel: number;
  cargo: InventoryState;
  temporaryEffects: ActiveEffect[];
  discoveredTiles: string[];
}

export interface EffectivePlayerStats {
  maxHealth: number;
  maxEnergy: number;
  energyRegenPerSec: number;
  energyCostPerSec: number;
  miningDamagePerSec: number;
  miningRange: number;
  moveSpeed: number;
  jumpVelocity: number;
  cargoCapacity: number;
  sightRadius: number;
  fuelEfficiency: number;
}

export interface SaveGame {
  version: 1;
  profile: PlayerProfile;
  activeRun?: RunState;
}
