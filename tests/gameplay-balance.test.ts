import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../apps/game/public/scripts/PlayerState/catalogs/items';
import { SKILL_TREE_BRANCHES, SKILL_TREE_IDS, UPGRADE_DEFINITIONS } from '../apps/game/public/scripts/PlayerState/catalogs/upgrades';
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

  it('defines a connected four-branch skill tree with real gameplay hooks', () => {
    expect(SKILL_TREE_IDS).toHaveLength(53);
    expect(new Set(SKILL_TREE_IDS).size).toBe(53);
    expect(UPGRADE_DEFINITIONS.prospector_core.prerequisites).toBeUndefined();
    for (const branch of Object.values(SKILL_TREE_BRANCHES)) {
      expect(branch).toHaveLength(13);
      let previous: (typeof SKILL_TREE_IDS)[number] = 'prospector_core';
      for (const id of branch) {
        expect(UPGRADE_DEFINITIONS[id].prerequisites).toEqual([previous]);
        previous = id;
      }
    }
    for (const id of SKILL_TREE_IDS.filter((id) => id !== 'prospector_core')) {
      expect(UPGRADE_DEFINITIONS[id].prerequisites?.length).toBeGreaterThan(0);
      expect(UPGRADE_DEFINITIONS[id].tree).toBeDefined();
    }
    expect(new Set(SKILL_TREE_IDS.map((id) => UPGRADE_DEFINITIONS[id].tree?.branch))).toEqual(
      new Set(['core', 'movement', 'vision', 'mining', 'utility']),
    );
    expect(readFileSync('apps/game/public/scripts/Gameplay/PlayerMovementScript.node.ts', 'utf8')).toContain('airJumpsRemaining');
    expect(readFileSync('apps/game/public/scripts/Gameplay/MiningScript.node.ts', 'utf8')).toContain('triggerChainMining');
    expect(readFileSync('apps/game/src/game/nodes/VisibilityFieldNode.ts', 'utf8')).toContain('redrawScanner');
    expect(readFileSync('apps/game/src/game/world/MiningEffects.ts', 'utf8')).toContain('getPickupRadius');
    const skillTreePrefab = JSON.parse(readFileSync('apps/game/public/prefabs/upgrade-dialog.prefab.json', 'utf8'));
    const behavior = skillTreePrefab.root.children.find((node: { name: string }) => node.name === 'UpgradeDialogBehavior');
    expect(behavior.props.buyButtonNodeIds).toHaveLength(13);
    expect(new Set(behavior.props.buyButtonNodeIds).size).toBe(13);
    expect(behavior.props.ringTextNodeId).toBe('tree-ring-text');
    expect(behavior.props.previousRingButtonNodeId).toBe('tree-ring-prev');
    expect(behavior.props.nextRingButtonNodeId).toBe('tree-ring-next');
    expect(behavior.props.purchaseButtonNodeId).toBe('tree-purchase');
    expect(behavior.props.detailTitleNodeId).toBe('tree-detail-title');
    expect(behavior.props.detailDescriptionNodeId).toBe('tree-detail-description');
    expect(behavior.props.connectorNodeIds).toHaveLength(12);
    expect(skillTreePrefab.root.props.size).toEqual({ width: 1240, height: 680 });
    const dialogSource = readFileSync('apps/game/public/scripts/UI/UpgradeDialogScript.node.ts', 'utf8');
    expect(dialogSource).toContain('const PAGE_COUNT = 5');
    expect(dialogSource).toContain("event.key === 'ArrowRight'");
    expect(dialogSource).toContain('purchaseSelected()');
    expect(dialogSource).toContain('setCallbacks({');
    expect(dialogSource).toContain("available: '#facc15'");
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
