import { TILE_SIZE } from '../../config/gameConfig';
import type { LevelData } from '../level';

export const START_TUNNEL_LEFT_TILE = -10;
export const START_TUNNEL_TOP_TILE = -2;
export const START_TUNNEL_WIDTH_TILES = 12;
export const START_TUNNEL_HEIGHT_TILES = 6;
export const SHIP_DOCK_CENTER_X = -3 * TILE_SIZE;
export const SHIP_DOCK_CENTER_Y = 2 * TILE_SIZE;
export const SHIP_DOCK_RADIUS = TILE_SIZE * 2.35;

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
