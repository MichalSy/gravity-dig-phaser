import Phaser from 'phaser';
import type { LevelData } from './level';

type Facing = 'east' | 'west';

export interface GameWorldData {
  level?: LevelData;
  player?: Phaser.GameObjects.Image;
  sceneObjects: Phaser.GameObjects.GameObject[];
}

export function createGameWorldData(): GameWorldData {
  return { sceneObjects: [] };
}

export interface PlayerAnimatorData {
  facing: Facing;
  animationId: string;
  walkSoundIndex: number;
  footstepTimerMs: number;
}

export function createPlayerAnimatorData(): PlayerAnimatorData {
  return {
    facing: 'east',
    animationId: 'idle.east',
    walkSoundIndex: 0,
    footstepTimerMs: 0,
  };
}

export interface ShipDockData {
  lastMessage: string;
  lastMessageTimerMs: number;
}

export function createShipDockData(): ShipDockData {
  return { lastMessage: '', lastMessageTimerMs: 0 };
}

export interface AutoSaveData {
  saveTimerMs: number;
}

export function createAutoSaveData(): AutoSaveData {
  return { saveTimerMs: 0 };
}

export interface PlayerMovementControllerData {
  velocity: Phaser.Math.Vector2;
  grounded: boolean;
  coyoteTimerSeconds: number;
  jumpBufferTimerSeconds: number;
  jumpHeld: boolean;
  inputBlocked: boolean;
}

export function createPlayerMovementControllerData(): PlayerMovementControllerData {
  return {
    velocity: new Phaser.Math.Vector2(0, 0),
    grounded: false,
    coyoteTimerSeconds: 0,
    jumpBufferTimerSeconds: 0,
    jumpHeld: false,
    inputBlocked: false,
  };
}

export interface MiningToolData {
  target?: import('./level').TileCell;
  currentAimWorld: Phaser.Math.Vector2;
  laserOrigin: Phaser.Math.Vector2;
  gamepadAim: Phaser.Math.Vector2;
}

export function createMiningToolData(): MiningToolData {
  return {
    currentAimWorld: new Phaser.Math.Vector2(1, 0),
    laserOrigin: new Phaser.Math.Vector2(0, 0),
    gamepadAim: new Phaser.Math.Vector2(1, 0),
  };
}
