import type { PlayerProfile } from './types';
import { createInventory } from './inventory';

export function createDefaultPlayerProfile(): PlayerProfile {
  return {
    version: 1,
    credits: 0,
    inventory: createInventory(500),
    equipment: {
      laser: 'laser_mk1',
      visor: 'standard_visor',
      battery: 'standard_battery',
      boots: 'no_boots',
      coreDetector: 'no_core_detector',
    },
    upgrades: {
      purchased: [],
    },
    perks: {
      unlocked: [],
      equipped: [],
    },
    unlockedPlanets: ['dev_planet', 'terra_prime'],
    stats: {
      runsStarted: 0,
      runsCompleted: 0,
      deaths: 0,
      blocksMined: 0,
      resourcesMined: 0,
      creditsEarned: 0,
      deepestTileReached: 0,
    },
  };
}
