import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../apps/game/public/scripts/PlayerState/catalogs/items';
import { UPGRADE_DEFINITIONS } from '../apps/game/public/scripts/PlayerState/catalogs/upgrades';
import { LIFE_SUPPORT_ENERGY_COST_PER_SEC, PLAYER_SPEED } from '../apps/game/public/scripts/PlayerState/playerConfig';

describe('early-game economy balance', () => {
  it('pays meaningful credits for every collected ground resource', () => {
    expect({
      sand: ITEM_DEFINITIONS.sand.value,
      clay: ITEM_DEFINITIONS.clay.value,
      gravel: ITEM_DEFINITIONS.gravel.value,
      stone: ITEM_DEFINITIONS.stone.value,
      basalt: ITEM_DEFINITIONS.basalt.value,
      copper: ITEM_DEFINITIONS.copper.value,
      iron: ITEM_DEFINITIONS.iron.value,
      gold: ITEM_DEFINITIONS.gold.value,
    }).toEqual({ sand: 2, clay: 2, gravel: 2, stone: 2, basalt: 4, copper: 6, iron: 10, gold: 30 });
  });

  it('starts speed progression near four percent instead of eleven percent', () => {
    const speedLevels = ['speed_mk1', 'speed_mk2', 'speed_mk3'] as const;
    const bonuses = speedLevels.map((id) => {
      const effect = UPGRADE_DEFINITIONS[id].effects[0];
      return Math.round(((effect.value / PLAYER_SPEED) - 1) * 100);
    });

    expect(bonuses).toEqual([4, 8, 12]);
    expect(UPGRADE_DEFINITIONS.speed_mk1.cost.credits).toBe(60);
  });

  it('uses a tighter visor progression and a finite life-support window', () => {
    expect(LIFE_SUPPORT_ENERGY_COST_PER_SEC).toBe(1.5);
    expect(100 / LIFE_SUPPORT_ENERGY_COST_PER_SEC).toBeCloseTo(66.67, 1);
    expect([
      UPGRADE_DEFINITIONS.visor_mk1.effects[0].value,
      UPGRADE_DEFINITIONS.visor_mk2.effects[0].value,
      UPGRADE_DEFINITIONS.radar_visor.effects[0].value,
      UPGRADE_DEFINITIONS.quantum_visor.effects[0].value,
    ]).toEqual([3, 4, 5, 6]);
    const shipSource = readFileSync('apps/game/public/scripts/Gameplay/ShipScript.node.ts', 'utf8');
    expect(shipSource).toContain('this.playerState.consumeLifeSupportEnergy(deltaMs / 1_000)');
  });

  it('keeps first upgrades within a few average starter cargo runs', () => {
    const averageStarterRunCredits = 18;
    const firstUpgradeCosts = [
      UPGRADE_DEFINITIONS.speed_mk1.cost.credits ?? Infinity,
      UPGRADE_DEFINITIONS.cargo_mk1.cost.credits ?? Infinity,
      UPGRADE_DEFINITIONS.cargo_stack_mk1.cost.credits ?? Infinity,
    ];

    const runs = firstUpgradeCosts.map((cost) => cost / averageStarterRunCredits);
    expect(runs[0]).toBeCloseTo(3.33, 1);
    expect(runs[1]).toBeCloseTo(4.17, 1);
    expect(runs[2]).toBe(5);
  });
});
