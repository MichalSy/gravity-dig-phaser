import { foregroundFrameForTile, TILE_HEALTH } from './tileTypes';
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
    solid: type !== 'air',
    foregroundFrame: foregroundFrameForTile(type),
    backwallFrame: boundary ? -1 : 0,
  });
}

export function clearTile(level: { tiles: Map<string, TileCell>; resources: Map<string, TileType> }, tileX: number, tileY: number): boolean {
  const key = tileKey(tileX, tileY);
  const cell = level.tiles.get(key);
  if (!cell || cell.boundary || cell.type === 'air') return false;
  cell.type = 'air';
  cell.health = 0;
  cell.solid = false;
  cell.foregroundFrame = -1;
  level.resources.delete(key);
  return true;
}
