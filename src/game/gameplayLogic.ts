import Phaser from 'phaser';
import { PLAYER_SIZE } from '../config/gameConfig';
import type { HudState, InputMode } from '../ui/HudState';
import type { LevelData } from './level';
import type { PlayerStateManagerNode } from './nodes/PlayerStateManagerNode';
import { SHIP_DOCK_CENTER_X, SHIP_DOCK_CENTER_Y, SHIP_DOCK_RADIUS } from './world/worldGeometry';

export interface PlayerAnimationState {
  facing: 'east' | 'west';
  textureKey: string;
  flipX: boolean;
  footstepFrame?: number;
}

export function computePlayerAnimationState(args: {
  playerX: number;
  aimX?: number;
  previousFacing: 'east' | 'west';
  velocity: Phaser.Math.Vector2;
  grounded: boolean;
  walkFrame: number;
}): PlayerAnimationState {
  let facing = args.previousFacing;
  if (args.aimX !== undefined && Math.abs(args.aimX - args.playerX) > 10) {
    facing = args.aimX >= args.playerX ? 'east' : 'west';
  } else if (Math.abs(args.velocity.x) > 1) {
    facing = args.velocity.x > 0 ? 'east' : 'west';
  }

  const airborne = !args.grounded;
  const moving = Math.abs(args.velocity.x) > 1;
  const prefix = airborne ? 'player-jump' : moving ? 'player-walk' : 'player-idle';
  const frame = airborne ? (args.velocity.y < 0 ? 0 : 1) : args.walkFrame % (moving ? 6 : 4);

  return {
    facing,
    textureKey: `${prefix}-${frame}`,
    flipX: facing === 'west',
    footstepFrame: !airborne && moving && (frame === 1 || frame === 4) ? frame : undefined,
  };
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
  playerState: PlayerStateManagerNode;
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
