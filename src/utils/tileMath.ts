import { TILE_SIZE } from '../config/gameConfig';
import { type TileType, TILE_ATLAS_COORDS } from '../game/level';

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function atlasFrame(type: Exclude<TileType, 'air'>): number {
  const [x, y] = TILE_ATLAS_COORDS[type];
  return y * 8 + x;
}

export function worldToTile(value: number): number {
  return Math.floor(value / TILE_SIZE);
}
