import { describe, expect, it, vi } from 'vitest';

vi.mock('@gravity-dig/game-core', () => ({
  ScriptNode: class {},
  prop: { number: (value: number) => value },
}));
import { addItem } from '../apps/game/public/scripts/PlayerState/inventory';
import { createRunState } from '../apps/game/public/scripts/PlayerState/RunState';
import { createDefaultSaveGame } from '../apps/game/public/scripts/PlayerState/saveGame';
import { computeEffectiveStats } from '../apps/game/public/scripts/PlayerState/stats';
import PlayerStateManager from '../apps/game/public/scripts/PlayerState/PlayerStateManager.node';

describe('public player state domain', () => {
  it('creates stable defaults and applies inventory constraints outside native runtime code', () => {
    const save = createDefaultSaveGame();
    const stats = computeEffectiveStats(save.profile);
    const run = createRunState('dev', 'seed', stats);

    expect(stats).toMatchObject({ moveSpeed: 470, jumpVelocity: -1040, miningRange: 330, cargoSlots: 2, cargoStackLimit: 3 });
    expect(run.cargo.slots).toHaveLength(2);
    expect(addItem(run.cargo, 'copper', 7)).toBe(6);
    expect(run.cargo.slots).toEqual([
      { itemId: 'copper', quantity: 3 },
      { itemId: 'copper', quantity: 3 },
    ]);
  });

  it('routes inspector patches into live run, stats, and profile state', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    const manager = new PlayerStateManager();
    manager.init();
    const run = manager.startRun('dev', 'inspector-seed', false);

    manager.onInspectorPropChanged('health', 72);
    manager.onInspectorPropChanged('maxHealth', 60);
    manager.onInspectorPropChanged('cargoSlots', 4);
    manager.onInspectorPropChanged('credits', 125);

    expect(run.health).toBe(60);
    expect(run.cargo.slots).toHaveLength(4);
    expect(manager.getInspectorPropValue('maxHealth')).toBe(60);
    expect(manager.getInspectorPropValue('credits')).toBe(125);
    vi.unstubAllGlobals();
  });
});
