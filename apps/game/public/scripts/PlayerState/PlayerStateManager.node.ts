import * as Core from '@gravity-dig/game-core';
import { ITEM_DEFINITIONS } from './catalogs/items';
import { addItem, normalizeInventory } from './inventory';
import { createRunState, normalizeRunState } from './RunState';
import { loadSaveGame, saveGame } from './saveGame';
import { computeEffectiveStats } from './stats';
import type { EffectivePlayerStats, ItemId, RunState, SaveGame } from './types';

export interface CargoReturnResult {
  message: string;
  transferred: number;
  credits: number;
}

export default class PlayerStateManager extends Core.ScriptNode {
  id = 'dynamic.player-state';
  name = 'Player State';

  health = Core.prop.number(100, { label: 'Health', min: 0, step: 1, group: 'Run' });
  energy = Core.prop.number(100, { label: 'Energy', min: 0, step: 1, group: 'Run' });
  fuel = Core.prop.number(100, { label: 'Fuel', min: 0, step: 1, group: 'Run' });

  maxHealth = Core.prop.number(100, { label: 'Max Health', min: 1, step: 1, group: 'Stats' });
  maxEnergy = Core.prop.number(100, { label: 'Max Energy', min: 1, step: 1, group: 'Stats' });
  energyRegenPerSec = Core.prop.number(18, { label: 'Energy Regen / sec', min: 0, step: 0.1, group: 'Stats' });
  energyCostPerSec = Core.prop.number(12, { label: 'Mining Energy Cost / sec', min: 0, step: 0.1, group: 'Stats' });
  miningDamagePerSec = Core.prop.number(120, { label: 'Mining Damage / sec', min: 0, step: 1, group: 'Stats' });
  miningRange = Core.prop.number(330, { label: 'Mining Range', min: 0, step: 1, group: 'Stats' });
  moveSpeed = Core.prop.number(470, { label: 'Move Speed', min: 0, step: 1, group: 'Stats' });
  jumpVelocity = Core.prop.number(-1040, { label: 'Jump Velocity', step: 1, group: 'Stats' });
  cargoSlots = Core.prop.number(2, { label: 'Cargo Slots', min: 1, step: 1, group: 'Stats' });
  cargoStackLimit = Core.prop.number(3, { label: 'Cargo Stack Limit', min: 1, step: 1, group: 'Stats' });
  sightRadius = Core.prop.number(3, { label: 'Sight Radius', min: 0, step: 1, group: 'Stats' });
  fuelEfficiency = Core.prop.number(1, { label: 'Fuel Efficiency', min: 0, step: 0.1, group: 'Stats' });

  credits = Core.prop.number(0, { label: 'Credits', min: 0, step: 1, group: 'Profile' });
  blocksMined = Core.prop.number(0, { label: 'Blocks Mined', min: 0, step: 1, group: 'Profile' });
  resourcesMined = Core.prop.number(0, { label: 'Resources Mined', min: 0, step: 1, group: 'Profile' });
  creditsEarned = Core.prop.number(0, { label: 'Credits Earned', min: 0, step: 1, group: 'Profile' });

  private saveGameState!: SaveGame;
  private activeRunState?: RunState;
  private effectivePlayerStats!: EffectivePlayerStats;
  private saveTimerMs = 0;
  private miningActive = false;

  init() {
    this.saveGameState = loadSaveGame();
    this.effectivePlayerStats = computeEffectiveStats(this.saveGameState.profile);
  }

  getInspectorPropValue(name: string): unknown {
    const run = this.activeRunState;
    switch (name) {
      case 'health': return run?.health ?? null;
      case 'energy': return run?.energy ?? null;
      case 'fuel': return run?.fuel ?? null;
      case 'credits': return this.saveGameState.profile.credits;
      case 'blocksMined': return this.saveGameState.profile.stats.blocksMined;
      case 'resourcesMined': return this.saveGameState.profile.stats.resourcesMined;
      case 'creditsEarned': return this.saveGameState.profile.stats.creditsEarned;
      case 'maxHealth':
      case 'maxEnergy':
      case 'energyRegenPerSec':
      case 'energyCostPerSec':
      case 'miningDamagePerSec':
      case 'miningRange':
      case 'moveSpeed':
      case 'jumpVelocity':
      case 'cargoSlots':
      case 'cargoStackLimit':
      case 'sightRadius':
      case 'fuelEfficiency':
        return this.effectivePlayerStats[name];
      default:
        return undefined;
    }
  }

  onInspectorPropChanged(name: string, value: unknown) {
    if (typeof value !== 'number') return;
    const run = this.activeRunState;
    switch (name) {
      case 'health':
        if (run) run.health = clamp(value, 0, this.effectivePlayerStats.maxHealth);
        return;
      case 'energy':
        if (run) run.energy = clamp(value, 0, this.effectivePlayerStats.maxEnergy);
        return;
      case 'fuel':
        if (run) run.fuel = Math.max(0, value);
        return;
      case 'credits':
        this.saveGameState.profile.credits = Math.max(0, Math.round(value));
        return;
      case 'blocksMined':
      case 'resourcesMined':
      case 'creditsEarned':
        this.saveGameState.profile.stats[name] = Math.max(0, Math.round(value));
        return;
      case 'maxHealth':
      case 'maxEnergy':
      case 'energyRegenPerSec':
      case 'energyCostPerSec':
      case 'miningDamagePerSec':
      case 'miningRange':
      case 'moveSpeed':
      case 'jumpVelocity':
      case 'cargoSlots':
      case 'cargoStackLimit':
      case 'sightRadius':
      case 'fuelEfficiency':
        this.effectivePlayerStats[name] = name === 'cargoSlots' || name === 'cargoStackLimit'
          ? Math.max(1, Math.round(value))
          : value;
        if (name === 'cargoSlots' || name === 'cargoStackLimit') this.syncCargoToStats();
        if (name === 'maxHealth' && run) run.health = clamp(run.health, 0, this.effectivePlayerStats.maxHealth);
        if (name === 'maxEnergy' && run) run.energy = clamp(run.energy, 0, this.effectivePlayerStats.maxEnergy);
    }
  }

  get save() { return this.saveGameState; }
  get run(): RunState {
    if (!this.activeRunState) throw new Error('No active run has been started');
    return this.activeRunState;
  }
  getActiveRun() { return this.activeRunState; }
  get stats() { return this.effectivePlayerStats; }
  getActiveRunSeed(fallback: string) { return this.saveGameState.activeRun?.seed ?? fallback; }

  startRun(planetId: string, seed: string, restoreActiveRun: boolean): RunState {
    const activeRun = restoreActiveRun && this.saveGameState.activeRun?.planetId === planetId && this.saveGameState.activeRun.seed === seed
      ? this.saveGameState.activeRun
      : undefined;
    this.activeRunState = activeRun
      ? normalizeRunState(activeRun, this.effectivePlayerStats)
      : createRunState(planetId, seed, this.effectivePlayerStats);
    this.saveTimerMs = 0;
    this.miningActive = false;
    this.saveActiveRun();
    return this.activeRunState;
  }

  update(deltaMs: number) {
    if (!this.activeRunState) return;
    if (!this.miningActive) this.recoverEnergy(deltaMs / 1000);
    this.saveTimerMs += deltaMs;
    if (this.saveTimerMs < 1000) return;
    this.saveTimerMs = 0;
    this.saveActiveRun();
  }

  setMiningActive(active: boolean) { this.miningActive = active; }
  hasMiningEnergy() { return this.run.energy > 0; }
  consumeMiningEnergy(deltaSeconds: number) {
    this.run.energy = Math.max(0, this.run.energy - this.effectivePlayerStats.energyCostPerSec * deltaSeconds);
  }
  recoverEnergy(deltaSeconds: number) {
    this.run.energy = Math.min(this.effectivePlayerStats.maxEnergy, this.run.energy + this.effectivePlayerStats.energyRegenPerSec * deltaSeconds);
  }
  refillEnergy() {
    this.run.energy = this.effectivePlayerStats.maxEnergy;
    this.saveActiveRun();
  }

  recordMinedTile(tileType: string) {
    if (tileType in ITEM_DEFINITIONS) this.saveGameState.profile.stats.resourcesMined += 1;
    this.saveGameState.profile.stats.blocksMined += 1;
    this.saveActiveRun();
  }

  tryCollectMinedItem(tileType: string): boolean {
    if (!(tileType in ITEM_DEFINITIONS)) return false;
    this.syncCargoToStats();
    if (addItem(this.run.cargo, tileType as ItemId, 1) !== 1) return false;
    this.saveActiveRun();
    return true;
  }

  syncCargoToStats() {
    if (!this.activeRunState) return;
    this.activeRunState.cargo = normalizeInventory(
      this.activeRunState.cargo,
      this.effectivePlayerStats.cargoSlots,
      this.effectivePlayerStats.cargoStackLimit,
    );
  }

  hasCargo() {
    return this.run.cargo.slots.some((slot) => Boolean(slot.itemId && slot.quantity > 0));
  }

  returnCargoToShip(): CargoReturnResult {
    const cargo = this.run.cargo.slots.filter((slot) => Boolean(slot.itemId && slot.quantity > 0));
    if (cargo.length === 0) {
      this.refillEnergy();
      return { message: 'Schiffsdock: Energie aufgefüllt', transferred: 0, credits: 0 };
    }
    let credits = 0;
    let transferred = 0;
    for (const slot of cargo) {
      if (!slot.itemId) continue;
      const itemId = slot.itemId;
      const definition = ITEM_DEFINITIONS[itemId];
      const quantity = slot.quantity;
      addItem(this.saveGameState.profile.inventory, itemId, quantity);
      credits += definition.value * quantity;
      transferred += quantity;
      delete slot.itemId;
      slot.quantity = 0;
    }
    this.saveGameState.profile.credits += credits;
    this.saveGameState.profile.stats.creditsEarned += credits;
    this.refillEnergy();
    return { message: `Cargo gesichert: ${transferred} Items · +${credits} Credits`, transferred, credits };
  }

  saveActiveRun() {
    if (!this.activeRunState) return;
    this.saveGameState.activeRun = this.activeRunState;
    saveGame(this.saveGameState);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
