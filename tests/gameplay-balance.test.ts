import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../apps/game/public/scripts/PlayerState/catalogs/items';
import { UPGRADE_DEFINITIONS } from '../apps/game/public/scripts/PlayerState/catalogs/upgrades';
import { PLAYER_SPEED } from '../apps/game/public/scripts/PlayerState/playerConfig';

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

  it('keeps first upgrades within a few average starter cargo runs', () => {
    const averageStarterRunCredits = 24;
    const firstUpgradeCosts = [
      UPGRADE_DEFINITIONS.speed_mk1.cost.credits ?? Infinity,
      UPGRADE_DEFINITIONS.cargo_mk1.cost.credits ?? Infinity,
      UPGRADE_DEFINITIONS.cargo_stack_mk1.cost.credits ?? Infinity,
    ];

    expect(firstUpgradeCosts.map((cost) => cost / averageStarterRunCredits)).toEqual([2.5, 3.125, 3.75]);
  });
});
