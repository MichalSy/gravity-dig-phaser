import Phaser from 'phaser';
import type { LevelData } from './level';

type Facing = 'east' | 'west';

export interface CameraZoomData {
  zoomOffset: number;
}

export function createCameraZoomData(): CameraZoomData {
  return { zoomOffset: 0 };
}

export interface GameWorldData {
  level?: LevelData;
  player?: Phaser.GameObjects.Image;
  sceneObjects: Phaser.GameObjects.GameObject[];
}

export function createGameWorldData(): GameWorldData {
  return { sceneObjects: [] };
}

export interface PlayerPresentationData {
  facing: Facing;
  walkTimerMs: number;
  walkFrame: number;
  walkSoundIndex: number;
  lastFootstepFrame: number;
}

export function createPlayerPresentationData(): PlayerPresentationData {
  return {
    facing: 'east',
    walkTimerMs: 0,
    walkFrame: 0,
    walkSoundIndex: 0,
    lastFootstepFrame: -1,
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

export interface PlayerControllerData {
  velocity: Phaser.Math.Vector2;
  grounded: boolean;
  coyoteTimerSeconds: number;
  jumpBufferTimerSeconds: number;
  jumpHeld: boolean;
  gravityEnabled: boolean;
  inputBlocked: boolean;
}

export function createPlayerControllerData(): PlayerControllerData {
  return {
    velocity: new Phaser.Math.Vector2(0, 0),
    grounded: false,
    coyoteTimerSeconds: 0,
    jumpBufferTimerSeconds: 0,
    jumpHeld: false,
    gravityEnabled: true,
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
