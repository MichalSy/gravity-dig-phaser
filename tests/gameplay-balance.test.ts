import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../apps/game/public/scripts/PlayerState/catalogs/items';
import { SKILL_TREE_BRANCHES, SKILL_TREE_IDS, UPGRADE_DEFINITIONS } from '../apps/game/public/scripts/PlayerState/catalogs/upgrades';
import { LIFE_SUPPORT_ENERGY_COST_PER_SEC, PLAYER_SPEED } from '../apps/game/public/scripts/PlayerState/playerConfig';
import { getConstellationNodePosition, type SkillTreeBranchId } from '../apps/game/public/scripts/UI/skillTreeLayout';

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
    const mapNode = skillTreePrefab.root.children.find((node: { nodeId?: string }) => node.nodeId === 'research-map');
    const inspector = skillTreePrefab.root.children.find((node: { nodeId?: string }) => node.nodeId === 'research-inspector');
    expect(skillTreePrefab.root.name).toBe('ResearchScreen');
    expect(mapNode).toMatchObject({
      nodeTypeId: 'b74c5d40-d19e-5e1c-8c8a-f61424cc3116',
      props: { size: { width: 1280, height: 720 } },
    });
    expect(inspector.children.some((node: { nodeId?: string }) => node.nodeId === 'research-purchase')).toBe(true);
    expect(behavior.props.mapNodeId).toBe('research-map');
    expect(behavior.props.inspectorRootNodeId).toBe('research-inspector');
    expect(behavior.props.purchaseButtonNodeId).toBe('research-purchase');
    expect(behavior.props.detailTitleNodeId).toBe('research-detail-title');
    expect(behavior.props.detailDescriptionNodeId).toBe('research-detail-description');
    expect(behavior.props.zoomInButtonNodeId).toBe('research-zoom-in');
    expect(behavior.props.zoomOutButtonNodeId).toBe('research-zoom-out');
    expect(behavior.props.resetViewButtonNodeId).toBe('research-reset-view');
    expect(skillTreePrefab.root.props.size).toEqual({ width: 1280, height: 720 });
    expect(skillTreePrefab.root.children.some((node: { nodeId?: string }) => node.nodeId === 'tree-frame')).toBe(false);
    expect(skillTreePrefab.root.children.some((node: { nodeId?: string }) => node.nodeId === 'tree-detail-panel')).toBe(false);
    const dialogSource = readFileSync('apps/game/public/scripts/UI/UpgradeDialogScript.node.ts', 'utf8');
    const mapSource = readFileSync('apps/game/src/ui/nodes/SkillTreeMapNode.ts', 'utf8');
    expect(dialogSource).toContain('const MAP_WIDTH = CONSTELLATION_MAP_WIDTH');
    expect(dialogSource).toContain('getConstellationNodePosition(');
    expect(dialogSource).toContain('this.map.setGraph(');
    expect(dialogSource).toContain('this.map.setInputInsets(');
    expect(dialogSource).toContain('this.map.setSelectCallback(');
    expect(dialogSource).toContain('purchaseSelected()');
    expect(mapSource).toContain("input.on('pointermove'");
    expect(mapSource).toContain("input.on('wheel'");
    expect(mapSource).toContain('updatePinch()');
    expect(mapSource).toContain('setInputInsets(');
    expect(mapSource).not.toContain('.setDepth(');
  });

  it('keeps every constellation node separated and gives the first tiers extra room', () => {
    const branches: SkillTreeBranchId[] = ['movement', 'vision', 'mining', 'utility'];
    const positions = branches.flatMap((branch) => Array.from({ length: 13 }, (_, index) => ({
      branch,
      tier: index + 1,
      ...getConstellationNodePosition(branch, index + 1),
    })));
    let minimumDistance = Number.POSITIVE_INFINITY;
    let minimumEarlyDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < positions.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < positions.length; otherIndex += 1) {
        const left = positions[index];
        const right = positions[otherIndex];
        const distance = Math.hypot(left.x - right.x, left.y - right.y);
        minimumDistance = Math.min(minimumDistance, distance);
        if (left.tier <= 3 && right.tier <= 3) minimumEarlyDistance = Math.min(minimumEarlyDistance, distance);
      }
    }
    expect(minimumDistance).toBeGreaterThan(60);
    expect(minimumEarlyDistance).toBeGreaterThan(110);
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
