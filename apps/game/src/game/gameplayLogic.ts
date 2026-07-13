import Phaser from 'phaser';
import { PLAYER_SIZE } from '../config/gameConfig';
import type { HudState, InputMode } from '../ui/HudState';
import type { LevelData } from './level';
import { SHIP_DOCK_CENTER_X, SHIP_DOCK_CENTER_Y, SHIP_DOCK_RADIUS } from './world/worldGeometry';

interface PlayerStateLike {
  run: { health: number; energy: number; fuel: number; cargo: HudState['cargo'] };
  stats: { maxHealth: number; maxEnergy: number };
}


export function isAtShipDock(playerX: number, playerY: number): boolean {
  return Phaser.Math.Distance.Between(playerX, playerY, SHIP_DOCK_CENTER_X, SHIP_DOCK_CENTER_Y) <= SHIP_DOCK_RADIUS;
}

export function buildShipDockPrompt(args: { atDock: boolean; hasCargo: boolean; credits: number; overrideMessage?: string }): string {
  if (args.overrideMessage) return args.overrideMessage;
  if (!args.atDock) return '';
  return `${args.hasCargo ? 'E: Cargo sichern & verkaufen' : 'E: Energie am Schiff auffüllen'} · Credits: ${args.credits}`;
}

export function buildHudState(args: {
  level: LevelData;
  inputMode: InputMode;
  playerState: PlayerStateLike;
}): HudState {
  return {
    title: 'GRAVITY DIG — Mobile Phaser-Port',
    planet: `Planet: ${args.level.planetName} | Seed: ${args.level.seed} | Gen: ${args.level.generationTimeMs}ms`,
    health: { current: args.playerState.run.health, max: args.playerState.stats.maxHealth },
    energy: { current: args.playerState.run.energy, max: args.playerState.stats.maxEnergy },
    fuel: { current: args.playerState.run.fuel, max: 100 },
    cargo: {
      slots: args.playerState.run.cargo.slots,
      visibleSlots: args.playerState.run.cargo.slots.length,
      stackLimit: args.playerState.run.cargo.stackLimit,
    },
    inputMode: args.inputMode,
  };
}

export function playerPromptY(playerY: number): number {
  return playerY - PLAYER_SIZE.h * 0.9;
}
