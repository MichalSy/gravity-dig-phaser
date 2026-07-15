import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type SceneNode = {
  name?: string;
  nodeTypeId?: string;
  children?: SceneNode[];
};

function findNode(root: SceneNode, name: string): SceneNode | undefined {
  if (root.name === name) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return undefined;
}

describe('loot rendering hierarchy', () => {
  it('declares a dedicated LootLayer as the first child of World', () => {
    const nodeTypeIdsSource = readFileSync('apps/game/src/nodes/NodeTypeIds.ts', 'utf8');
    const lootLayerNodeTypeId = nodeTypeIdsSource.match(/LootLayerNode:\s*'([^']+)'/)?.[1];
    const scene = JSON.parse(readFileSync('apps/game/public/scenes/gameplay.scene.json', 'utf8')) as { root: SceneNode };
    const world = findNode(scene.root, 'World');

    expect(lootLayerNodeTypeId).toBeTruthy();
    expect(world?.children?.[0]).toMatchObject({
      name: 'LootLayer',
      nodeTypeId: lootLayerNodeTypeId,
    });
  });

  it('places a dedicated effects layer after World and the visibility field after effects', () => {
    const nodeTypeIdsSource = readFileSync('apps/game/src/nodes/NodeTypeIds.ts', 'utf8');
    const effectsLayerNodeTypeId = nodeTypeIdsSource.match(/EffectsLayerNode:\s*'([^']+)'/)?.[1];
    const scene = JSON.parse(readFileSync('apps/game/public/scenes/gameplay.scene.json', 'utf8')) as { root: SceneNode };
    const gameRoot = findNode(scene.root, 'GameRoot');
    const children = gameRoot?.children ?? [];
    const worldIndex = children.findIndex((child) => child.name === 'World');
    const effectsIndex = children.findIndex((child) => child.name === 'EffectsLayer');
    const visibilityIndex = children.findIndex((child) => child.name === 'VisibilityField');
    const visibilitySource = readFileSync('apps/game/src/game/nodes/VisibilityFieldNode.ts', 'utf8');
    const miningSource = readFileSync('apps/game/src/game/world/MiningEffects.ts', 'utf8');
    const cargoEffectsSource = readFileSync('apps/game/src/game/world/CargoTransferEffects.ts', 'utf8');

    expect(effectsLayerNodeTypeId).toBeTruthy();
    expect(children[effectsIndex]).toMatchObject({ name: 'EffectsLayer', nodeTypeId: effectsLayerNodeTypeId });
    expect(worldIndex).toBeGreaterThanOrEqual(0);
    expect(effectsIndex).toBeGreaterThan(worldIndex);
    expect(visibilityIndex).toBeGreaterThan(effectsIndex);
    expect(visibilitySource).not.toContain('.setDepth(');
    expect(miningSource).not.toContain('.setDepth(');
    expect(cargoEffectsSource).not.toContain('.setDepth(');
  });

  it('does not assign static depth values to player or ground drops', () => {
    const worldSource = readFileSync('apps/game/src/game/nodes/GameWorldNode.ts', 'utf8');
    const miningSource = readFileSync('apps/game/src/game/world/MiningEffects.ts', 'utf8');
    const dropSource = miningSource.slice(miningSource.indexOf('spawnDrop('), miningSource.indexOf('update(deltaMs'));

    expect(worldSource).not.toContain('player.setDepth');
    expect(dropSource).not.toContain('.setDepth(');
  });
});
