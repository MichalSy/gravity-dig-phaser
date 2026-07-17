import { describe, expect, it, vi } from 'vitest';

vi.mock('@gravity-dig/game-core', () => ({
  ScriptNode: class {},
  prop: { number: (value: number) => value },
}));
import { SKILL_TREE_IDS } from '../apps/game/public/scripts/PlayerState/catalogs/upgrades';
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

    expect(stats).toMatchObject({ moveSpeed: 470, jumpVelocity: -1040, miningRange: 330, cargoSlots: 2, cargoStackLimit: 3, sightRadius: 2 });
    expect(run.cargo.slots).toHaveLength(2);
    expect(addItem(run.cargo, 'copper', 7)).toBe(6);
    expect(run.cargo.slots).toEqual([
      { itemId: 'copper', quantity: 3 },
      { itemId: 'copper', quantity: 3 },
    ]);
  });

  it('keeps mined resources on the ground until cargo can accept them', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    const manager = new PlayerStateManager();
    manager.init();
    const run = manager.startRun('dev', 'pickup-seed', false);

    manager.recordMinedTile('copper');
    expect(run.cargo.slots.every((slot) => slot.quantity === 0)).toBe(true);
    expect(manager.tryCollectMinedItem('copper')).toBe(true);
    expect(run.cargo.slots[0]).toEqual({ itemId: 'copper', quantity: 1 });

    addItem(run.cargo, 'copper', 5);
    const fullCargo = structuredClone(run.cargo.slots);
    expect(manager.tryCollectMinedItem('iron')).toBe(false);
    expect(run.cargo.slots).toEqual(fullCargo);
    vi.unstubAllGlobals();
  });

  it('only recharges at the ship and transfers cargo one animated unit at a time', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    const manager = new PlayerStateManager();
    manager.init();
    const run = manager.startRun('dev', 'ship-transfer-seed', false);
    run.energy = 20;
    manager.update(1_000);
    expect(run.energy).toBe(20);
    manager.consumeLifeSupportEnergy(10);
    expect(run.energy).toBe(5);
    manager.recoverEnergyAtShip(1);
    expect(run.energy).toBe(23);

    addItem(run.cargo, 'copper', 2);
    expect(manager.transferNextCargoItemToShip()).toEqual({ itemId: 'copper', slotIndex: 0, credits: 6 });
    expect(run.cargo.slots[0]).toEqual({ itemId: 'copper', quantity: 1 });
    expect(manager.save.profile.credits).toBe(6);
    vi.unstubAllGlobals();
  });

  it('purchases sequential speed and cargo upgrades and applies them to the active run', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    const manager = new PlayerStateManager();
    manager.init();
    manager.startRun('test-planet', 'upgrade-seed', false);
    expect(manager.purchaseUpgrade('speed_mk1')).toEqual({ ok: false, message: 'Nicht genug Credits' });
    manager.onInspectorPropChanged('credits', 2_000);

    expect(manager.purchaseUpgrade('cargo_mk2')).toEqual({ ok: false, message: 'Vorherige Stufe erforderlich' });
    expect(manager.purchaseUpgrade('speed_mk1').ok).toBe(true);
    expect(manager.stats.moveSpeed).toBe(489);
    expect(manager.purchaseUpgrade('speed_mk1')).toEqual({ ok: false, message: 'Bereits installiert' });
    expect(manager.purchaseUpgrade('speed_mk2').ok).toBe(true);
    expect(manager.stats.moveSpeed).toBe(508);

    expect(manager.purchaseUpgrade('cargo_mk1').ok).toBe(true);
    expect(manager.stats.cargoSlots).toBe(3);
    expect(manager.run.cargo.slots).toHaveLength(3);
    expect(manager.purchaseUpgrade('cargo_stack_mk1').ok).toBe(true);
    expect(manager.stats.cargoStackLimit).toBe(5);
    expect(manager.run.cargo.stackLimit).toBe(5);
    expect(manager.getProfileCredits()).toBe(1_595);
  });

  it('enforces skill-tree prerequisites and applies active branch abilities', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    const manager = new PlayerStateManager();
    manager.init();
    manager.startRun('test-planet', 'skill-tree-seed', false);
    manager.onInspectorPropChanged('credits', 20_000);

    expect(manager.purchaseUpgrade('chain_lightning')).toEqual({ ok: false, message: 'Vorherige Stufe erforderlich' });
    expect(manager.purchaseUpgrade('prospector_core').ok).toBe(true);
    expect(manager.stats.maxEnergy).toBe(110);
    expect(manager.purchaseUpgrade('laser_focus').ok).toBe(true);
    expect(manager.purchaseUpgrade('chain_lightning').ok).toBe(true);
    expect(manager.stats.miningDamagePerSec).toBe(150);
    expect(manager.stats.chainMiningTargets).toBe(2);
    expect(manager.purchaseUpgrade('spring_boots').ok).toBe(true);
    expect(manager.purchaseUpgrade('micro_jetpack').ok).toBe(true);
    expect(manager.stats.airJumps).toBe(1);
    expect(manager.purchaseUpgrade('wide_visor').ok).toBe(true);
    expect(manager.purchaseUpgrade('ore_scanner').ok).toBe(true);
    expect(manager.stats.sightRadius).toBe(3);
    expect(manager.stats.oreScannerRadius).toBe(4);
    expect(manager.purchaseUpgrade('cargo_tetris').ok).toBe(true);
    expect(manager.purchaseUpgrade('pocket_wormhole').ok).toBe(true);
    expect(manager.stats.cargoSlots).toBe(3);
    expect(manager.stats.cargoStackLimit).toBe(6);
    expect(manager.stats.pickupRadius).toBe(140);
  });

  it('supports alternative and converging research routes without changing upgrade ids', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    const manager = new PlayerStateManager();
    manager.init();
    manager.startRun('test-planet', 'route-seed', false);
    manager.onInspectorPropChanged('credits', 20_000);

    expect(manager.purchaseUpgrade('prospector_core').ok).toBe(true);
    expect(manager.purchaseUpgrade('cargo_tetris').ok).toBe(true);
    expect(manager.purchaseUpgrade('micro_jetpack').ok).toBe(true);
    expect(manager.isUpgradePurchased('spring_boots')).toBe(false);
    expect(manager.purchaseUpgrade('rocket_pants')).toEqual({ ok: false, message: 'Vorherige Stufe erforderlich' });
    expect(manager.purchaseUpgrade('wide_visor').ok).toBe(true);
    expect(manager.purchaseUpgrade('rocket_pants').ok).toBe(true);
    vi.unstubAllGlobals();
  });

  it('opens real choices, reaches one skill from different directions, and keeps mastery gates', () => {
    const createManager = (seed: string) => {
      vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
      const manager = new PlayerStateManager();
      manager.init();
      manager.startRun('test-planet', seed, false);
      manager.onInspectorPropChanged('credits', 100_000);
      expect(manager.purchaseUpgrade('prospector_core').ok).toBe(true);
      expect(manager.purchaseUpgrade('spring_boots').ok).toBe(true);
      return manager;
    };

    const jetpackRoute = createManager('jetpack-route');
    expect(jetpackRoute.purchaseUpgrade('micro_jetpack').ok).toBe(true);
    expect(jetpackRoute.purchaseUpgrade('ceiling_negotiator').ok).toBe(true);
    expect(jetpackRoute.purchaseUpgrade('turbo_snail').ok).toBe(true);
    expect(jetpackRoute.purchaseUpgrade('bounce_tax_refund').ok).toBe(true);

    const rocketRoute = createManager('rocket-route');
    expect(rocketRoute.purchaseUpgrade('rocket_pants').ok).toBe(true);
    expect(rocketRoute.isUpgradePurchased('micro_jetpack')).toBe(false);
    expect(rocketRoute.purchaseUpgrade('ceiling_negotiator').ok).toBe(true);
    vi.unstubAllGlobals();
  });

  it('keeps already purchased skill ids from older linear saves', () => {
    const oldSave = createDefaultSaveGame();
    oldSave.profile.upgrades.purchased = ['prospector_core', 'spring_boots', 'micro_jetpack', 'rocket_pants'];
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify(oldSave),
      setItem: () => undefined,
    });
    const manager = new PlayerStateManager();
    manager.init();
    for (const id of oldSave.profile.upgrades.purchased) expect(manager.isUpgradePurchased(id)).toBe(true);
    expect(manager.stats.airJumps).toBe(2);
    vi.unstubAllGlobals();
  });

  it('can purchase all 53 research skills only in valid tree order', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    const manager = new PlayerStateManager();
    manager.init();
    manager.startRun('test-planet', 'full-orbit-seed', false);
    manager.onInspectorPropChanged('credits', 1_000_000);

    expect(manager.purchaseUpgrade('reality_premium')).toEqual({ ok: false, message: 'Vorherige Stufe erforderlich' });
    const remaining = new Set(SKILL_TREE_IDS);
    let progressed = true;
    while (remaining.size > 0 && progressed) {
      progressed = false;
      for (const upgradeId of [...remaining]) {
        if (!manager.purchaseUpgrade(upgradeId).ok) continue;
        remaining.delete(upgradeId);
        progressed = true;
      }
    }
    expect([...remaining]).toEqual([]);

    expect(new Set(manager.save.profile.upgrades.purchased)).toEqual(new Set(SKILL_TREE_IDS));
    expect(manager.getProfileCredits()).toBe(584_675);
    expect(manager.stats.airJumps).toBe(4);
    expect(manager.stats.chainMiningTargets).toBe(12);
    expect(manager.stats.pickupRadius).toBeGreaterThan(400);
    expect(manager.stats.sightRadius).toBeGreaterThanOrEqual(10);
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

  it('persists discovered tiles once per active run', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    const manager = new PlayerStateManager();
    manager.init();
    manager.startRun('dev', 'exploration-seed', false);

    expect(manager.discoverTiles(['1:2', '2:2'])).toBe(2);
    expect(manager.discoverTiles(['1:2', '3:2'])).toBe(1);
    expect(manager.getDiscoveredTiles()).toEqual(['1:2', '2:2', '3:2']);
    expect(manager.save.activeRun?.discoveredTiles).toEqual(['1:2', '2:2', '3:2']);
    vi.unstubAllGlobals();
  });
});
