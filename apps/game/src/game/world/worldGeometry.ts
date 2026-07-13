import { TILE_SIZE } from '../../config/gameConfig';
import type { LevelData } from '../level';

export const SHIP_DOCK_CENTER_X = -3 * TILE_SIZE;
export const SHIP_DOCK_CENTER_Y = 2 * TILE_SIZE;
export const SHIP_DOCK_RADIUS = TILE_SIZE * 2.35;

export function spawnToWorld(level: LevelData): { x: number; y: number } {
  return {
    x: level.spawn.x * level.tileSize + level.tileSize / 2,
    y: level.spawn.y * level.tileSize + level.tileSize / 2,
  };
}

export function worldBoundsForLevel(level: LevelData): { x: number; y: number; width: number; height: number } {
  const cells = [...level.tiles.values()];
  const minX = Math.min(...cells.map(({ x }) => x));
  const maxX = Math.max(...cells.map(({ x }) => x));
  const minY = Math.min(...cells.map(({ y }) => y));
  const maxY = Math.max(...cells.map(({ y }) => y));
  return {
    x: minX * level.tileSize,
    y: minY * level.tileSize,
    width: (maxX - minX + 1) * level.tileSize,
    height: (maxY - minY + 1) * level.tileSize,
  };
}
