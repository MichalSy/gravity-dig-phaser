import { GameNode } from '../../nodes';
import { ITEM_DEFINITIONS } from '../../player/catalogs/items';
import { addItem } from '../../player/inventory';
import { createRunState, normalizeRunState } from '../../player/RunState';
import { loadSaveGame, saveGame } from '../../player/saveGame';
import { computeEffectiveStats } from '../../player/stats';
import type { EffectivePlayerStats, ItemId, RunState, SaveGame } from '../../player/types';
import type { TileType } from '../level';

export interface CargoReturnResult {
  message: string;
  transferred: number;
  credits: number;
}

export class PlayerStateManagerNode extends GameNode {
  private saveGameState!: SaveGame;
  private activeRunState?: RunState;
  private effectivePlayerStats!: EffectivePlayerStats;
  private saveTimerMs = 0;
  private miningActive = false;

  constructor() {
    super({ name: 'PlayerState', className: 'PlayerStateManagerNode' });
  }

  init(): void {
    this.saveGameState = loadSaveGame();
    this.effectivePlayerStats = computeEffectiveStats(this.saveGameState.profile);
  }

  get save(): SaveGame {
    return this.saveGameState;
  }

  get run(): RunState {
    if (!this.activeRunState) throw new Error('No active run has been started');
    return this.activeRunState;
  }

  get stats(): EffectivePlayerStats {
    return this.effectivePlayerStats;
  }

  getActiveRunSeed(fallback: string): string {
    return this.saveGameState.activeRun?.seed ?? fallback;
  }

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

  update(deltaMs: number): void {
    if (!this.activeRunState) return;

    if (!this.miningActive) this.recoverEnergy(deltaMs / 1000);

    this.saveTimerMs += deltaMs;
    if (this.saveTimerMs < 1000) return;

    this.saveTimerMs = 0;
    this.saveActiveRun();
  }

  setMiningActive(active: boolean): void {
    this.miningActive = active;
  }

  hasMiningEnergy(): boolean {
    return this.run.energy > 0;
  }

  consumeMiningEnergy(deltaSeconds: number): void {
    this.run.energy = Math.max(0, this.run.energy - this.effectivePlayerStats.energyCostPerSec * deltaSeconds);
  }

  recoverEnergy(deltaSeconds: number): void {
    this.run.energy = Math.min(
      this.effectivePlayerStats.maxEnergy,
      this.run.energy + this.effectivePlayerStats.energyRegenPerSec * deltaSeconds,
    );
  }

  refillEnergy(): void {
    this.run.energy = this.effectivePlayerStats.maxEnergy;
    this.saveActiveRun();
  }

  recordMinedTile(tileType: TileType): void {
    if (isResourceItem(tileType)) {
      addItem(this.run.cargo, tileType as ItemId, 1);
      this.saveGameState.profile.stats.resourcesMined += 1;
    }

    this.saveGameState.profile.stats.blocksMined += 1;
    this.saveActiveRun();
  }

  hasCargo(): boolean {
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

  saveActiveRun(): void {
    if (!this.activeRunState) return;
    this.saveGameState.activeRun = this.activeRunState;
    saveGame(this.saveGameState);
  }
}

function isResourceItem(tileType: TileType): boolean {
  return tileType in ITEM_DEFINITIONS;
}
