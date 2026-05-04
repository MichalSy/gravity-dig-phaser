import { GameNode } from '../nodes';
import { ITEM_DEFINITIONS } from '../player/catalogs/items';
import { addItem } from '../player/inventory';
import { createRunState, normalizeRunState } from '../player/RunState';
import { loadSaveGame, saveGame } from '../player/saveGame';
import { computeEffectiveStats } from '../player/stats';
import type { TileType } from './level';
import type { EffectivePlayerStats, ItemId, RunState, SaveGame } from '../player/types';

export interface CargoReturnResult {
  message: string;
  transferred: number;
  credits: number;
}

export class ManagersNode extends GameNode {
  constructor() {
    super({ name: 'Managers', order: 0 });
    this.addChild(new PlayerStateManagerNode());
  }
}

export class PlayerStateManagerNode extends GameNode {
  private saveGameState!: SaveGame;
  private activeRunState!: RunState;
  private effectivePlayerStats!: EffectivePlayerStats;

  constructor() {
    super({ name: 'playerState', order: 0 });
  }

  init(): void {
    this.saveGameState = loadSaveGame();
    this.effectivePlayerStats = computeEffectiveStats(this.saveGameState.profile);
  }

  get save(): SaveGame {
    return this.saveGameState;
  }

  get run(): RunState {
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
    this.saveActiveRun();
    return this.activeRunState;
  }

  hasMiningEnergy(): boolean {
    return this.activeRunState.energy > 0;
  }

  consumeMiningEnergy(deltaSeconds: number): void {
    this.activeRunState.energy = Math.max(0, this.activeRunState.energy - this.effectivePlayerStats.energyCostPerSec * deltaSeconds);
  }

  recoverEnergy(deltaSeconds: number): void {
    this.activeRunState.energy = Math.min(
      this.effectivePlayerStats.maxEnergy,
      this.activeRunState.energy + this.effectivePlayerStats.energyRegenPerSec * deltaSeconds,
    );
  }

  refillEnergy(): void {
    this.activeRunState.energy = this.effectivePlayerStats.maxEnergy;
    this.saveActiveRun();
  }

  recordMinedTile(tileType: TileType): void {
    if (isResourceItem(tileType)) {
      addItem(this.activeRunState.cargo, tileType as ItemId, 1);
      this.saveGameState.profile.stats.resourcesMined += 1;
    }

    this.saveGameState.profile.stats.blocksMined += 1;
    this.saveActiveRun();
  }

  hasCargo(): boolean {
    return this.activeRunState.cargo.slots.some((slot) => Boolean(slot.itemId && slot.quantity > 0));
  }

  returnCargoToShip(): CargoReturnResult {
    const cargo = this.activeRunState.cargo.slots.filter((slot) => Boolean(slot.itemId && slot.quantity > 0));
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
    this.saveGameState.activeRun = this.activeRunState;
    saveGame(this.saveGameState);
  }
}

function isResourceItem(tileType: TileType): boolean {
  return tileType in ITEM_DEFINITIONS;
}
