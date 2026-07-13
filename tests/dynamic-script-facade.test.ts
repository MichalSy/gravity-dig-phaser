import { describe, expect, it } from 'vitest';
import { createDynamicScriptNode, type DynamicNodeModule } from '../packages/game-core/src/dynamic-nodes/DynamicScriptNode';
import { prop } from '../packages/game-core/src/dynamic-nodes/DynamicNodeApi';

function module(multiplier: number): DynamicNodeModule {
  return {
    nodeTypeId: 'dynamic.test-facade',
    createBehavior: () => {
      const behavior: { count: number; readonly doubled: number; increment(amount: number): number } = {
        count: 2,
        get doubled() { return this.count * multiplier; },
        increment(amount: number) {
          this.count += amount;
          return this.count;
        },
      };
      return behavior;
    },
  };
}

describe('dynamic script facade', () => {
  it('forwards methods, getters, setters, and reloaded behavior through the node', () => {
    const node = createDynamicScriptNode({ module: module(2) }) as unknown as {
      count: number;
      doubled: number;
      increment(amount: number): number;
      reloadModule(next: DynamicNodeModule): void;
    };

    expect(node.increment(3)).toBe(5);
    expect(node.doubled).toBe(10);
    node.count = 7;
    expect(node.doubled).toBe(14);
    node.reloadModule(module(3));
    expect(node.increment(1)).toBe(3);
    expect(node.doubled).toBe(9);
  });

  it('groups public inspector props and routes reads and patches through semantic hooks', () => {
    const behavior = {
      speed: prop.number(10, { label: 'Speed', min: 0, group: 'Stats' }),
      effectiveSpeed: 14,
      getInspectorPropValue(name: string) {
        return name === 'speed' ? this.effectiveSpeed : undefined;
      },
      onInspectorPropChanged(name: string, value: unknown) {
        if (name === 'speed' && typeof value === 'number') this.effectiveSpeed = Math.max(0, value);
      },
    };
    const node = createDynamicScriptNode({
      module: { nodeTypeId: 'dynamic.inspector-test', createBehavior: () => behavior },
    });

    const definition = node.getSceneDefinition();
    expect(definition?.exposedPropGroups.find((group) => group.name === 'Stats')?.props.speed).toMatchObject({ type: 'Number', label: 'Speed' });
    expect(node.getDebugProps().speed).toBe(14);

    expect(node.applySceneProps({ speed: 23 })).toEqual({ applied: { speed: 23 }, rejected: {} });
    expect(behavior.effectiveSpeed).toBe(23);
    expect(node.getDebugProps().speed).toBe(23);
  });
});
