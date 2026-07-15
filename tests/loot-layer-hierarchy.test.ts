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

  it('does not assign static depth values to player or ground drops', () => {
    const worldSource = readFileSync('apps/game/src/game/nodes/GameWorldNode.ts', 'utf8');
    const miningSource = readFileSync('apps/game/src/game/world/MiningEffects.ts', 'utf8');
    const dropSource = miningSource.slice(miningSource.indexOf('spawnDrop('), miningSource.indexOf('update(deltaMs'));

    expect(worldSource).not.toContain('player.setDepth');
    expect(dropSource).not.toContain('.setDepth(');
  });
});
