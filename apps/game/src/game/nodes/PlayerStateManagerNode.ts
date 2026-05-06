import type { DebugNodePatch } from '@gravity-dig/debug-protocol';
import { NODE_TYPE_IDS, exposedPropGroup, GameNode, propNumber, type ExposedPropGroup, type NodeDebugProps } from '../../nodes';
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
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.PlayerStateManagerNode;

  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    ...GameNode.exposedPropGroups,
    exposedPropGroup('Run', {
      health: propNumber({ label: 'Health', min: 0, step: 1 }),
      energy: propNumber({ label: 'Energy', min: 0, step: 1 }),
      fuel: propNumber({ label: 'Fuel', min: 0, step: 1 }),
    }),
    exposedPropGroup('Stats', {
      maxHealth: propNumber({ label: 'Max Health', min: 1, step: 1 }),
      maxEnergy: propNumber({ label: 'Max Energy', min: 1, step: 1 }),
      energyRegenPerSec: propNumber({ label: 'Energy Regen / sec', min: 0, step: 0.1 }),
      energyCostPerSec: propNumber({ label: 'Mining Energy Cost / sec', min: 0, step: 0.1 }),
      miningDamagePerSec: propNumber({ label: 'Mining Damage / sec', min: 0, step: 1 }),
      miningRange: propNumber({ label: 'Mining Range', min: 0, step: 1 }),
      moveSpeed: propNumber({ label: 'Move Speed', min: 0, step: 1 }),
      jumpVelocity: propNumber({ label: 'Jump Velocity', step: 1 }),
      cargoSlots: propNumber({ label: 'Cargo Slots', min: 1, step: 1 }),
      cargoStackLimit: propNumber({ label: 'Cargo Stack Limit', min: 1, step: 1 }),
      sightRadius: propNumber({ label: 'Sight Radius', min: 0, step: 1 }),
      fuelEfficiency: propNumber({ label: 'Fuel Efficiency', min: 0, step: 0.1 }),
    }),
    exposedPropGroup('Profile', {
      credits: propNumber({ label: 'Credits', min: 0, step: 1 }),
      blocksMined: propNumber({ label: 'Blocks Mined', min: 0, step: 1 }),
      resourcesMined: propNumber({ label: 'Resources Mined', min: 0, step: 1 }),
      creditsEarned: propNumber({ label: 'Credits Earned', min: 0, step: 1 }),
    }),
  ];
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


  override getDebugProps(): NodeDebugProps {
    const run = this.activeRunState;
    return {
      ...super.getDebugProps(),
      health: run?.health ?? null,
      energy: run?.energy ?? null,
      fuel: run?.fuel ?? null,
      cargoSlotsUsed: run ? run.cargo.slots.filter((slot) => Boolean(slot.itemId && slot.quantity > 0)).length : null,
      maxHealth: this.effectivePlayerStats.maxHealth,
      maxEnergy: this.effectivePlayerStats.maxEnergy,
      energyRegenPerSec: this.effectivePlayerStats.energyRegenPerSec,
      energyCostPerSec: this.effectivePlayerStats.energyCostPerSec,
      miningDamagePerSec: this.effectivePlayerStats.miningDamagePerSec,
      miningRange: this.effectivePlayerStats.miningRange,
      moveSpeed: this.effectivePlayerStats.moveSpeed,
      jumpVelocity: this.effectivePlayerStats.jumpVelocity,
      cargoSlots: this.effectivePlayerStats.cargoSlots,
      cargoStackLimit: this.effectivePlayerStats.cargoStackLimit,
      sightRadius: this.effectivePlayerStats.sightRadius,
      fuelEfficiency: this.effectivePlayerStats.fuelEfficiency,
      credits: this.saveGameState.profile.credits,
      blocksMined: this.saveGameState.profile.stats.blocksMined,
      resourcesMined: this.saveGameState.profile.stats.resourcesMined,
      creditsEarned: this.saveGameState.profile.stats.creditsEarned,
      miningActive: this.miningActive,
    };
  }

  protected override applySceneProp(key: string, value: DebugNodePatch[string]): boolean {
    if (typeof value !== 'number') return super.applySceneProp(key, value);

    switch (key) {
      case 'health':
        this.run.health = clamp(value, 0, this.effectivePlayerStats.maxHealth);
        return true;
      case 'energy':
        this.run.energy = clamp(value, 0, this.effectivePlayerStats.maxEnergy);
        return true;
      case 'fuel':
        this.run.fuel = Math.max(0, value);
        return true;
      case 'credits':
        this.saveGameState.profile.credits = Math.max(0, Math.round(value));
        return true;
      case 'blocksMined':
        this.saveGameState.profile.stats.blocksMined = Math.max(0, Math.round(value));
        return true;
      case 'resourcesMined':
        this.saveGameState.profile.stats.resourcesMined = Math.max(0, Math.round(value));
        return true;
      case 'creditsEarned':
        this.saveGameState.profile.stats.creditsEarned = Math.max(0, Math.round(value));
        return true;
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
        this.effectivePlayerStats[key] = key === 'cargoSlots' || key === 'cargoStackLimit' ? Math.max(1, Math.round(value)) : value;
        if (key === 'maxHealth') this.run.health = clamp(this.run.health, 0, this.effectivePlayerStats.maxHealth);
        if (key === 'maxEnergy') this.run.energy = clamp(this.run.energy, 0, this.effectivePlayerStats.maxEnergy);
        return true;
      default:
        return super.applySceneProp(key, value);
    }
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
