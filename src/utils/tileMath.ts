import { TILE_SIZE } from '../config/gameConfig';
import { type TileType, TILE_ATLAS_COORDS } from '../game/level';

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function atlasFrame(type: Exclude<TileType, 'air'>): number {
  const [x, y] = TILE_ATLAS_COORDS[type];
  return y * 8 + x;
}

export function atlasFrameForTile(type: Exclude<TileType, 'air'>, _tileX: number, _tileY: number): number {
  return atlasFrame(type);
}

export function backwallFrameForTile(_tileX: number, _tileY: number, variant = 0): number {
  return variant;
}

export function worldToTile(value: number): number {
  return Math.floor(value / TILE_SIZE);
}
