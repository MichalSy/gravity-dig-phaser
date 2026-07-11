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
