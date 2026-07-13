import { describe, expect, it } from 'vitest';
import { createDynamicScriptNode, type DynamicNodeModule } from '../packages/game-core/src/dynamic-nodes/DynamicScriptNode';

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
});
