import {
  ENERGY_COST_PER_SEC,
  ENERGY_REGEN_PER_SEC,
  JUMP_VELOCITY,
  MINING_DAMAGE_PER_SEC,
  MINING_RANGE,
  PLAYER_SPEED,
} from '../config/gameConfig';
import { PERK_DEFINITIONS } from './catalogs/perks';
import { UPGRADE_DEFINITIONS } from './catalogs/upgrades';
import type { EffectivePlayerStats, PlayerProfile, StatModifier } from './types';

export function computeEffectiveStats(profile: PlayerProfile): EffectivePlayerStats {
  const stats: EffectivePlayerStats = {
    maxHealth: 100,
    maxEnergy: 100,
    energyRegenPerSec: ENERGY_REGEN_PER_SEC,
    energyCostPerSec: ENERGY_COST_PER_SEC,
    miningDamagePerSec: MINING_DAMAGE_PER_SEC,
    miningRange: MINING_RANGE,
    moveSpeed: PLAYER_SPEED,
    jumpVelocity: JUMP_VELOCITY,
    cargoCapacity: 100,
    sightRadius: 3,
    fuelEfficiency: 1,
  };

  const modifiers = collectModifiers(profile);
  for (const modifier of modifiers) applyModifier(stats, modifier);

  return stats;
}

function collectModifiers(profile: PlayerProfile): StatModifier[] {
  const upgradeModifiers = profile.upgrades.purchased.flatMap((upgradeId) => UPGRADE_DEFINITIONS[upgradeId]?.effects ?? []);
  const perkModifiers = profile.perks.equipped.flatMap((perkId) => PERK_DEFINITIONS[perkId]?.effects ?? []);
  return [...upgradeModifiers, ...perkModifiers];
}

function applyModifier(stats: EffectivePlayerStats, modifier: StatModifier): void {
  if (modifier.op === 'add') {
    stats[modifier.stat] += modifier.value;
    return;
  }

  if (modifier.op === 'multiply') {
    stats[modifier.stat] *= modifier.value;
    return;
  }

  stats[modifier.stat] = modifier.value;
}
