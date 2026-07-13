import { describe, expect, it } from 'vitest';
import { addItem } from '../apps/game/public/scripts/PlayerState/inventory';
import { createRunState } from '../apps/game/public/scripts/PlayerState/RunState';
import { createDefaultSaveGame } from '../apps/game/public/scripts/PlayerState/saveGame';
import { computeEffectiveStats } from '../apps/game/public/scripts/PlayerState/stats';

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
});
