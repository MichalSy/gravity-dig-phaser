import Phaser from 'phaser';
import { PLAYER_SIZE, TILE_SIZE } from '../config/gameConfig';
import type { HudState, InputMode } from '../ui/HudState';
import type { LevelData, TileCell } from './level';
import type { MiningToolNode } from './nodes/MiningToolNode';
import type { PlayerStateManagerNode } from './nodes/PlayerStateManagerNode';
import type { CameraZoomNode } from './nodes/CameraZoomNode';

export const START_TUNNEL_LEFT_TILE = -10;
export const START_TUNNEL_TOP_TILE = -2;
export const START_TUNNEL_WIDTH_TILES = 12;
export const START_TUNNEL_HEIGHT_TILES = 6;
export const SHIP_DOCK_CENTER_X = -3 * TILE_SIZE;
export const SHIP_DOCK_CENTER_Y = 2 * TILE_SIZE;
export const SHIP_DOCK_RADIUS = TILE_SIZE * 2.35;

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
  gravityEnabled: boolean;
  grounded: boolean;
  walkFrame: number;
}): PlayerAnimationState {
  let facing = args.previousFacing;
  if (args.aimX !== undefined && Math.abs(args.aimX - args.playerX) > 10) {
    facing = args.aimX >= args.playerX ? 'east' : 'west';
  } else if (Math.abs(args.velocity.x) > 1) {
    facing = args.velocity.x > 0 ? 'east' : 'west';
  }

  const airborne = args.gravityEnabled && !args.grounded;
  const moving = Math.abs(args.velocity.x) > 1 || (!args.gravityEnabled && Math.abs(args.velocity.y) > 1);
  const prefix = airborne ? 'player-jump' : moving ? 'player-walk' : 'player-idle';
  const frame = airborne ? (args.velocity.y < 0 ? 0 : 1) : args.walkFrame % (moving ? 6 : 4);

  return {
    facing,
    textureKey: `${prefix}-${frame}`,
    flipX: facing === 'west',
    footstepFrame: !airborne && moving && args.grounded && (frame === 1 || frame === 4) ? frame : undefined,
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
  miningTool: MiningToolNode;
  cameraZoom: CameraZoomNode;
}): HudState {
  const tile = args.miningTool.target;
  const controls = args.inputMode === 'touch'
    ? 'Touch: linker Stick laufen/springen · rechter Stick zielen & minen'
    : args.inputMode === 'gamepad'
      ? 'Gamepad: Left Stick laufen · A springen · Right Stick zielen · RT/RB minen'
      : 'Desktop: A/D laufen · W/Space springen · Maus Laser · G Gravity · R Seed';

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
    debug: controls,
    zoom: args.cameraZoom.zoomLabel,
    target: formatMiningTarget(tile),
    inputMode: args.inputMode,
  };
}

function formatMiningTarget(tile: TileCell | undefined): string {
  return tile ? `Target: ${tile.type} (${Math.max(0, Math.ceil(tile.health))}/${tile.maxHealth}) @ ${tile.x},${tile.y}` : 'Target: keines in Reichweite';
}

export function spawnToWorld(level: LevelData): { x: number; y: number } {
  return {
    x: level.spawn.x * TILE_SIZE + TILE_SIZE / 2,
    y: level.spawn.y * TILE_SIZE + TILE_SIZE / 2,
  };
}

export function worldBoundsForLevel(level: LevelData): { x: number; y: number; width: number; height: number } {
  return {
    x: -10 * TILE_SIZE,
    y: (-level.heightDown - 1) * TILE_SIZE,
    width: (level.width + 12) * TILE_SIZE,
    height: (level.heightUp + level.heightDown + 2) * TILE_SIZE,
  };
}

export function playerPromptY(playerY: number): number {
  return playerY - PLAYER_SIZE.h * 0.9;
}
