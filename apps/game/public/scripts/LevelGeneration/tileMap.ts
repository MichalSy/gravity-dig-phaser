import { TILE_HEALTH } from './tileTypes';
import type { TileCell, TileType } from './types';

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function setTile(tiles: Map<string, TileCell>, x: number, y: number, type: TileType, boundary: boolean): void {
  tiles.set(tileKey(x, y), {
    x,
    y,
    type,
    health: TILE_HEALTH[type],
    maxHealth: TILE_HEALTH[type],
    boundary,
  });
}
