import { TILE_SIZE } from '../config/gameConfig';
import { type TileType, TILE_ATLAS_COORDS } from '../game/level';

export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

const BEDROCK_VARIANT_ATLAS_COORDS: [number, number][] = [
  [3, 0],
  [4, 0],
  [3, 1],
  [4, 1],
];

export function atlasFrame(type: Exclude<TileType, 'air'>): number {
  const [x, y] = TILE_ATLAS_COORDS[type];
  return y * 8 + x;
}

export function atlasFrameForTile(type: Exclude<TileType, 'air'>, tileX: number, tileY: number): number {
  if (type !== 'bedrock') return atlasFrame(type);

  const variant = tileVariant(tileX, tileY, BEDROCK_VARIANT_ATLAS_COORDS.length);
  const [x, y] = BEDROCK_VARIANT_ATLAS_COORDS[variant];
  return y * 8 + x;
}

export function backwallFrameForTile(tileX: number, tileY: number): number {
  return tileVariant(tileX, tileY, 4);
}

function tileVariant(tileX: number, tileY: number, variants: number): number {
  return Math.abs((tileX * 73856093) ^ (tileY * 19349663)) % variants;
}

export function worldToTile(value: number): number {
  return Math.floor(value / TILE_SIZE);
}
