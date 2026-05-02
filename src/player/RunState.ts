import { createInventory, normalizeInventory } from './inventory';
import type { EffectivePlayerStats, RunState } from './types';

export function createRunState(planetId: string, seed: string, stats: EffectivePlayerStats): RunState {
  return {
    planetId,
    seed,
    health: stats.maxHealth,
    energy: stats.maxEnergy,
    fuel: 100,
    cargo: createInventory(stats.cargoSlots, stats.cargoStackLimit),
    temporaryEffects: [],
    discoveredTiles: [],
  };
}

export function normalizeRunState(run: RunState, stats: EffectivePlayerStats): RunState {
  return {
    ...run,
    health: Math.min(run.health, stats.maxHealth),
    energy: Math.min(run.energy, stats.maxEnergy),
    cargo: normalizeInventory(run.cargo, stats.cargoSlots, stats.cargoStackLimit),
    temporaryEffects: run.temporaryEffects ?? [],
    discoveredTiles: run.discoveredTiles ?? [],
  };
}
