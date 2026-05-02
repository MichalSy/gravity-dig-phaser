import { createInventory } from './inventory';
import type { EffectivePlayerStats, RunState } from './types';

export function createRunState(planetId: string, seed: string, stats: EffectivePlayerStats): RunState {
  return {
    planetId,
    seed,
    health: stats.maxHealth,
    energy: stats.maxEnergy,
    fuel: 100,
    cargo: createInventory(stats.cargoCapacity),
    temporaryEffects: [],
    discoveredTiles: [],
  };
}

export function normalizeRunState(run: RunState, stats: EffectivePlayerStats): RunState {
  return {
    ...run,
    health: Math.min(run.health, stats.maxHealth),
    energy: Math.min(run.energy, stats.maxEnergy),
    cargo: {
      capacity: stats.cargoCapacity,
      items: run.cargo.items ?? {},
    },
    temporaryEffects: run.temporaryEffects ?? [],
    discoveredTiles: run.discoveredTiles ?? [],
  };
}
