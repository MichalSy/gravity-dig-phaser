import Phaser from 'phaser';
import type { LevelData } from './level';

export interface GameWorldData {
  level?: LevelData;
  player?: Phaser.GameObjects.Image;
  sceneObjects: Phaser.GameObjects.GameObject[];
}

export function createGameWorldData(): GameWorldData {
  return { sceneObjects: [] };
}
