import { describe, expect, it } from 'vitest';
import { parseGameSettings } from '../packages/game-core/src/config/GameSettings';
import { RuntimeManagerHost } from '../packages/game-core/src/nodes/RuntimeManagerHost';
import type { GameNode } from '../packages/game-core/src/nodes/GameNode';
import type { NodeRuntime } from '../packages/game-core/src/nodes/NodeRuntime';
import type { PrefabManager } from '../packages/game-core/src/nodes/PrefabManager';
import type { SceneFileJson, SceneNodeFactoryRegistry } from '../packages/game-core/src/nodes/SceneNodeFactory';

function managerFile(id: string): SceneFileJson {
  return {
    version: 1,
    root: {
      nodeTypeId: 'test.manager',
      instanceId: `${id}-instance`,
      name: id,
      children: [],
    },
  };
}

describe('RuntimeManagerHost', () => {
  it('mounts dependencies once, tears down scene managers in reverse order, and preserves source metadata', async () => {
    const settings = parseGameSettings({
      version: 1,
      scenes: {
        startup: 'a',
        editorDefault: 'a',
        definitions: {
          a: { path: 'scenes/a.scene.json' },
          b: { path: 'scenes/b.scene.json' },
        },
      },
      managers: [
        { id: 'base', path: 'managers/base.manager.json', mountWhen: ['a', 'b'], lifetime: 'runtime', modes: ['play'], order: 1 },
        { id: 'a-ui', path: 'managers/a-ui.manager.json', mountWhen: ['a'], lifetime: 'scene', modes: ['play'], dependsOn: ['base'], order: 2 },
        { id: 'a-overlay', path: 'managers/a-overlay.manager.json', mountWhen: ['a'], lifetime: 'scene', modes: ['play'], dependsOn: ['a-ui'], order: 3 },
        { id: 'b-ui', path: 'managers/b-ui.manager.json', mountWhen: ['b'], lifetime: 'scene', modes: ['play'], dependsOn: ['base'], order: 2 },
      ],
    });
    const events: string[] = [];
    const creationMetadata: Array<{ origin?: string; managerPath?: string }> = [];
    const nodes = new Map<string, GameNode>();

    const runtime = {
      addPersistentNode(node: GameNode) {
        events.push(`add:${node.name}`);
        return node;
      },
      removePersistentNode(node: GameNode) {
        events.push(`remove:${node.name}`);
      },
    } as unknown as NodeRuntime;
    const factory = {
      createTree(root: SceneFileJson['root'], metadata: { origin?: string; managerPath?: string }) {
        creationMetadata.push(metadata);
        const node = { name: root.name, parent: undefined } as unknown as GameNode;
        nodes.set(root.name ?? '', node);
        return node;
      },
    } as unknown as SceneNodeFactoryRegistry;
    const prefabManager = {
      async ensureDefinitions(root: SceneFileJson['root']) {
        events.push(`ensure:${root.name}`);
      },
    } as unknown as PrefabManager;

    const host = new RuntimeManagerHost({
      runtime,
      factory,
      prefabManager,
      settings,
      mode: 'play',
      loadManager: async (path) => managerFile(path.split('/').at(-1)!.replace('.manager.json', '')),
    });

    await host.activateScene('a');
    await host.activateScene('a');
    await host.activateScene('b');
    host.deactivateScene('b');
    host.destroy();

    expect(events).toEqual([
      'ensure:base', 'add:base',
      'ensure:a-ui', 'add:a-ui',
      'ensure:a-overlay', 'add:a-overlay',
      'remove:a-overlay', 'remove:a-ui',
      'ensure:b-ui', 'add:b-ui',
      'remove:b-ui',
      'remove:base',
    ]);
    expect(creationMetadata).toEqual([
      { origin: 'runtime-code', managerPath: 'managers/base.manager.json' },
      { origin: 'runtime-code', managerPath: 'managers/a-ui.manager.json' },
      { origin: 'runtime-code', managerPath: 'managers/a-overlay.manager.json' },
      { origin: 'runtime-code', managerPath: 'managers/b-ui.manager.json' },
    ]);
    expect(host.mountedManagers).toEqual([]);
  });
});
