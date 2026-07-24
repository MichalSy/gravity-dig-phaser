import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../apps/game/public/scripts/PlayerState/catalogs/items';
import { SKILL_TREE_BRANCHES, SKILL_TREE_IDS, UPGRADE_DEFINITIONS } from '../apps/game/public/scripts/PlayerState/catalogs/upgrades';
import { LIFE_SUPPORT_ENERGY_COST_PER_SEC, PLAYER_SPEED } from '../apps/game/public/scripts/PlayerState/playerConfig';
import { CONSTELLATION_ROOT, getConstellationNodePosition, type SkillTreeBranchId } from '../apps/game/public/scripts/UI/skillTreeLayout';

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
    const skillIds = new Set(SKILL_TREE_IDS);
    for (const branch of Object.values(SKILL_TREE_BRANCHES)) {
      expect(branch).toHaveLength(13);
      for (const id of branch) {
        const prerequisites = UPGRADE_DEFINITIONS[id].prerequisites ?? [];
        expect(prerequisites.length).toBeGreaterThan(0);
        expect(prerequisites.every((prerequisite) => skillIds.has(prerequisite))).toBe(true);
        expect(prerequisites).not.toContain(id);
      }
    }
    const multiRouteSkills = SKILL_TREE_IDS.filter((id) => (UPGRADE_DEFINITIONS[id].prerequisites?.length ?? 0) > 1);
    const alternativeRouteSkills = multiRouteSkills.filter((id) => UPGRADE_DEFINITIONS[id].prerequisiteMode === 'any');
    expect(multiRouteSkills.length).toBeGreaterThanOrEqual(10);
    expect(alternativeRouteSkills.length).toBeGreaterThanOrEqual(8);
    expect(UPGRADE_DEFINITIONS.micro_jetpack.prerequisites).toEqual(['spring_boots', 'cargo_tetris']);
    expect(UPGRADE_DEFINITIONS.micro_jetpack.prerequisiteMode).toBe('any');
    expect(UPGRADE_DEFINITIONS.rocket_pants.prerequisites).toEqual(['spring_boots', 'wide_visor']);
    expect(UPGRADE_DEFINITIONS.rocket_pants.prerequisiteMode).toBe('any');
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
    const skillNodePrefab = JSON.parse(readFileSync('apps/game/public/prefabs/skill-tree-node.prefab.json', 'utf8'));
    const skillEdgePrefab = JSON.parse(readFileSync('apps/game/public/prefabs/skill-tree-edge.prefab.json', 'utf8'));
    const behavior = skillTreePrefab.root.children.find((node: { name: string }) => node.name === 'UpgradeDialogBehavior');
    const mapNode = skillTreePrefab.root.children.find((node: { nodeId?: string }) => node.nodeId === 'research-map');
    const popover = skillTreePrefab.root.children.find((node: { nodeId?: string }) => node.nodeId === 'research-popover');
    expect(skillTreePrefab.root.name).toBe('ResearchScreen');
    expect(mapNode).toMatchObject({
      nodeTypeId: 'b74c5d40-d19e-5e1c-8c8a-f61424cc3116',
      props: { size: { width: 1280, height: 720 } },
    });
    const mapBackground = mapNode.children.find((node: { nodeId?: string }) => node.nodeId === 'research-map-background');
    const mapWorld = mapNode.children.find((node: { nodeId?: string }) => node.nodeId === 'research-map-world');
    expect(mapBackground).toMatchObject({
      nodeTypeId: '73e926f5-c280-5131-b820-a89f898e2d48',
      props: { assetId: 'research-anime-background', size: { width: 1280, height: 720 } },
    });
    expect(mapWorld.nodeTypeId).toBe('b78a74e0-452a-5e20-85f4-579f7c0b1364');
    expect(mapWorld.children.map((node: { nodeId: string }) => node.nodeId)).toEqual([
      'research-map-edges',
      'research-map-cards',
    ]);
    expect(skillNodePrefab.root.nodeTypeId).toBe('b78a74e0-452a-5e20-85f4-579f7c0b1364');
    expect(skillNodePrefab.root.props.size).toEqual({ width: 88, height: 88 });
    expect(skillNodePrefab.root.children.some((node: { nodeTypeId: string }) =>
      node.nodeTypeId === '7e6751bd-678f-4eb0-ba25-cb5a07df7ba9')).toBe(true);
    expect(skillNodePrefab.root.children.some((node: { nodeTypeId: string }) =>
      node.nodeTypeId === '57e0af09-fe20-40bc-b154-2ba2708e5783')).toBe(true);
    expect(skillNodePrefab.root.children.some((node: { nodeTypeId: string }) =>
      node.nodeTypeId === '73e926f5-c280-5131-b820-a89f898e2d48')).toBe(true);
    expect(skillNodePrefab.root.children.some((node: { nodeTypeId: string }) =>
      node.nodeTypeId === '2db287f7-b55c-5c58-be87-c057e8c5d302')).toBe(true);
    expect(skillEdgePrefab.root.children).toHaveLength(2);
    expect(skillEdgePrefab.root.children.every((node: { nodeTypeId: string }) =>
      node.nodeTypeId === 'b1bc7a02-4eab-54c0-9180-0c9e336f28a7')).toBe(true);
    expect(popover.children.some((node: { nodeId?: string }) => node.nodeId === 'research-purchase')).toBe(true);
    expect(popover.children.some((node: { nodeId?: string }) => node.nodeId === 'research-cost')).toBe(true);
    expect(popover.children.some((node: { nodeId?: string }) => node.nodeId === 'research-status')).toBe(false);
    expect(popover.props.size).toEqual({ width: 420, height: 210 });
    const popoverArt = popover.children.find((node: { nodeId?: string }) => node.nodeId === 'research-popover-art');
    expect(popoverArt.props).toMatchObject({
      assetId: 'research-popover-art',
      size: { width: 560, height: 280 },
      scale: { x: 0.75, y: 0.75 },
    });
    expect(popover.children.some((node: { nodeId?: string }) => node.nodeId === 'research-popover-surface')).toBe(false);
    expect(popover.children.some((node: { nodeId?: string }) => node.nodeId === 'research-learn-surface')).toBe(false);
    expect(popover.children.some((node: { nodeId?: string }) => node.nodeId === 'research-popover-close')).toBe(false);
    const purchaseButton = popover.children.find((node: { nodeId?: string }) => node.nodeId === 'research-purchase');
    expect(purchaseButton.props).toMatchObject({
      size: { width: 150, height: 42 },
      position: { x: 120, y: 75 },
      normalAssetId: 'research-hit-purchase',
      activeAssetId: 'research-hit-purchase',
    });
    const headerArt = skillTreePrefab.root.children.find((node: { nodeId?: string }) => node.nodeId === 'research-header-art');
    expect(headerArt.props).toMatchObject({ assetId: 'research-header-art', size: { width: 1280, height: 110 } });
    const title = skillTreePrefab.root.children.find((node: { nodeId?: string }) => node.nodeId === 'research-title');
    expect(title.props).toMatchObject({ text: 'TALENTBAUM', fontId: 'silkscreen-latin-700' });
    expect(title.nodeTypeId).toBe('2db287f7-b55c-5c58-be87-c057e8c5d302');
    expect(skillTreePrefab.root.children.some((node: { nodeId?: string }) => node.nodeId === 'research-hud-glass')).toBe(false);
    expect(skillTreePrefab.root.children.some((node: { nodeId?: string }) => node.nodeId === 'research-credits-capsule')).toBe(false);
    expect(skillTreePrefab.root.children.some((node: { nodeId?: string }) => node.nodeId === 'research-progress-capsule')).toBe(false);
    expect(skillTreePrefab.root.children.some((node: { nodeId?: string }) => node.nodeId === 'research-title-capsule')).toBe(false);
    expect(behavior.props.mapNodeId).toBe('research-map');
    expect(behavior.props.mapWorldRootNodeId).toBe('research-map-world');
    expect(behavior.props.mapEdgesRootNodeId).toBe('research-map-edges');
    expect(behavior.props.mapCardsRootNodeId).toBe('research-map-cards');
    expect(behavior.props.skillNodePrefabId).toBe(skillNodePrefab.prefabId);
    expect(behavior.props.skillEdgePrefabId).toBe(skillEdgePrefab.prefabId);
    expect(behavior.props.popoverRootNodeId).toBe('research-popover');
    expect(behavior.props.purchaseButtonNodeId).toBe('research-purchase');
    expect(behavior.props.detailTitleNodeId).toBe('research-detail-title');
    expect(behavior.props.detailDescriptionNodeId).toBe('research-detail-description');
    expect(behavior.props.zoomInButtonNodeId).toBeUndefined();
    expect(behavior.props.zoomOutButtonNodeId).toBeUndefined();
    expect(behavior.props.resetViewButtonNodeId).toBeUndefined();
    expect(skillTreePrefab.root.children.some((node: { nodeId?: string }) => node.nodeId?.startsWith('research-zoom'))).toBe(false);
    expect(skillTreePrefab.root.children.some((node: { nodeId?: string }) => node.nodeId === 'research-reset-view')).toBe(false);
    expect(skillTreePrefab.root.props.size).toEqual({ width: 1280, height: 720 });
    expect(skillTreePrefab.root.children.some((node: { nodeId?: string }) => node.nodeId === 'tree-frame')).toBe(false);
    expect(skillTreePrefab.root.children.some((node: { nodeId?: string }) => node.nodeId === 'tree-detail-panel')).toBe(false);
    const dialogSource = readFileSync('apps/game/public/scripts/UI/UpgradeDialogScript.node.ts', 'utf8');
    const mapSource = readFileSync('apps/game/src/ui/nodes/SkillTreeMapNode.ts', 'utf8');
    expect(dialogSource).toContain('width: CONSTELLATION_MAP_WIDTH');
    expect(dialogSource).toContain('getConstellationNodePosition(');
    expect(dialogSource).toContain('this.map.setGraph(');
    expect(dialogSource).toContain('this.map.setInputInsets(');
    expect(dialogSource).toContain('this.map.setInputExclusion(');
    expect(dialogSource).toContain('this.map.setSelectCallback(');
    expect(dialogSource).toContain('this.selectedUpgradeId === upgradeId');
    expect(mapSource).toContain('this.selectCallback?.(undefined');
    expect(dialogSource).toContain('purchaseSelected()');
    expect(mapSource).toContain("input.on('pointermove'");
    expect(mapSource).toContain("input.on('wheel'");
    expect(mapSource).toContain('updatePinch()');
    expect(mapSource).toContain('setInputInsets(');
    expect(mapSource).toContain('* this.zoom + 95');
    expect(mapSource).toContain('this.worldRoot?.applySceneProps(');
    expect(mapSource).toContain('this.viewChangeCallback?.();');
    expect(dialogSource).toContain('this.map.setWorldRoot(this.mapWorldRoot)');
    expect(dialogSource).toContain('this.map.setViewChangeCallback(');
    expect(dialogSource).toContain('this.updatePopoverPosition()');
    expect(dialogSource).toContain('this.instantiatePrefab<SkillCardRoot>(this.skillNodePrefabId');
    expect(dialogSource).toContain('this.instantiatePrefab<EdgeRoot>(this.skillEdgePrefabId');
    expect(dialogSource).toContain('const iconScale = iconSize / SKILL_ICON_SOURCE_SIZE');
    expect(dialogSource).toContain('this.syncGraphPresentation(nodes, edges)');
    expect(dialogSource).not.toContain('this.map.setSelectedNode');
    expect(mapSource).not.toContain('setSelectedNode(');
    expect(dialogSource).not.toContain('if (edge.secondary) continue;');
    expect(dialogSource).toContain('edge.from === this.selectedUpgradeId || edge.to === this.selectedUpgradeId');
    expect(dialogSource).toContain('lineWidth: edge.secondary ? 8 : 12');
    expect(dialogSource).toContain('lineWidth: edge.secondary ? 3 : 6');
    expect(dialogSource).toContain("tint: node.state === 'locked' ? '#b5cad8' : '#ffffff'");
    for (const forbidden of [
      'phaserScene.add.image',
      'phaserScene.add.graphics',
      'phaserScene.add.container',
      'phaserScene.add.text',
      'phaserScene.add.rectangle',
      'phaserScene.add.line',
      'phaserScene.add.sprite',
      'backgroundImage',
      'edgeGraphics',
      'nodeGraphics',
      'iconsContainer',
      'labelsContainer',
      'viewportContainer',
      'worldContainer',
    ]) {
      expect(mapSource).not.toContain(forbidden);
    }
    expect(mapSource).not.toContain('.setDepth(');
    const assetManifest = JSON.parse(readFileSync('apps/game/public/assets/assets.manifest.json', 'utf8'));
    const researchImages = assetManifest.groups.gameplay.images.filter((asset: { key: string }) => asset.key.startsWith('research-'));
    expect(researchImages).toHaveLength(58);
    expect(researchImages.some((asset: { key: string }) => asset.key === 'research-anime-background')).toBe(true);
    expect(researchImages.some((asset: { key: string }) => asset.key === 'research-header-art')).toBe(true);
    expect(researchImages.some((asset: { key: string }) => asset.key === 'research-popover-art')).toBe(true);
    expect(researchImages.some((asset: { key: string }) => asset.key === 'research-hit-back')).toBe(true);
    expect(researchImages.some((asset: { key: string }) => asset.key === 'research-hit-close')).toBe(false);
    expect(researchImages.some((asset: { key: string }) => asset.key === 'research-hit-purchase')).toBe(true);
    expect(researchImages.some((asset: { key: string }) => asset.key === 'research-title-wordmark')).toBe(false);
    expect(researchImages.some((asset: { key: string }) => asset.key === 'research-popover-panel')).toBe(false);
    for (const id of SKILL_TREE_IDS) {
      expect(researchImages.some((asset: { key: string }) => asset.key === `research-skill-${id}`)).toBe(true);
    }
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

  it('places every skill on one uniform orthogonal grid', () => {
    const branches: SkillTreeBranchId[] = ['movement', 'vision', 'mining', 'utility'];
    const positions = branches.flatMap((branch) => Array.from({ length: 13 }, (_, index) =>
      getConstellationNodePosition(branch, index + 1)));
    expect(new Set(positions.map(({ x, y }) => `${x}:${y}`))).toHaveLength(52);
    for (const position of positions) {
      expect(Math.abs((position.x - CONSTELLATION_ROOT.x) % 180)).toBe(0);
      expect(Math.abs((position.y - CONSTELLATION_ROOT.y) % 180)).toBe(0);
    }
  });

  it('connects visible skills only to direct grid neighbours except for the authored entry forks', () => {
    const branches: SkillTreeBranchId[] = ['movement', 'vision', 'mining', 'utility'];
    for (const branch of branches) {
      const ids = SKILL_TREE_BRANCHES[branch];
      const positions = new Map(ids.map((id, index) => [id, getConstellationNodePosition(branch, index + 1)]));
      for (const [index, id] of ids.entries()) {
        const target = positions.get(id)!;
        for (const prerequisite of UPGRADE_DEFINITIONS[id].prerequisites ?? []) {
          if (prerequisite === 'prospector_core' || !positions.has(prerequisite)) continue;
          const source = positions.get(prerequisite)!;
          const dx = Math.abs(target.x - source.x);
          const dy = Math.abs(target.y - source.y);
          if (prerequisite === ids[0] && index >= 1 && index <= 3) {
            expect(dx).toBe(180);
            expect(dy).toBeLessThanOrEqual(180);
          } else {
            expect((dx === 180 && dy === 0) || (dx === 0 && dy === 180)).toBe(true);
          }
        }
      }
    }
  });

  it('uses forks, alternative routes, convergences, and acyclic capstones in every family', () => {
    const visited = new Set<string>();
    const active = new Set<string>();
    const visit = (id: string) => {
      expect(active.has(id)).toBe(false);
      if (visited.has(id)) return;
      active.add(id);
      for (const prerequisite of UPGRADE_DEFINITIONS[id as keyof typeof UPGRADE_DEFINITIONS].prerequisites ?? []) {
        if (SKILL_TREE_IDS.includes(prerequisite)) visit(prerequisite);
      }
      active.delete(id);
      visited.add(id);
    };
    for (const id of SKILL_TREE_IDS) visit(id);
    expect(visited).toHaveLength(53);

    for (const ids of Object.values(SKILL_TREE_BRANCHES)) {
      expect(UPGRADE_DEFINITIONS[ids[0]].prerequisites).toEqual(['prospector_core']);
      for (const id of ids.slice(1, 4)) {
        expect(UPGRADE_DEFINITIONS[id].prerequisites).toContain(ids[0]);
      }
      const alternativeNodes = ids.filter((id) => UPGRADE_DEFINITIONS[id].prerequisiteMode === 'any');
      const convergingNodes = ids.filter((id) =>
        UPGRADE_DEFINITIONS[id].prerequisiteMode !== 'any'
        && (UPGRADE_DEFINITIONS[id].prerequisites?.length ?? 0) >= 2);
      expect(alternativeNodes.length).toBeGreaterThanOrEqual(5);
      expect(convergingNodes.length).toBeGreaterThanOrEqual(2);
      expect(UPGRADE_DEFINITIONS[ids[12]].prerequisiteMode).toBe('any');
      expect(UPGRADE_DEFINITIONS[ids[12]].prerequisites).toEqual([ids[9], ids[11]]);
    }
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
