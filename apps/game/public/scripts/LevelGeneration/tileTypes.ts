import type { TileType } from './types';

const RESOURCE_TYPES = new Set<TileType>(['copper', 'iron', 'gold', 'diamond']);

export const TILE_HEALTH: Record<TileType, number> = {
  air: 0,
  dirt: 20,
  sand: 15,
  clay: 25,
  gravel: 40,
  stone: 50,
  basalt: 55,
  copper: 60,
  iron: 70,
  gold: 80,
  diamond: 110,
  bedrock: 9999,
};

export const TILE_ATLAS_COORDS: Record<Exclude<TileType, 'air'>, [number, number]> = {
  basalt: [2, 0],
  bedrock: [3, 0],
  clay: [4, 0],
  copper: [6, 0],
  diamond: [0, 1],
  dirt: [1, 1],
  gold: [6, 1],
  gravel: [0, 2],
  iron: [2, 2],
  sand: [4, 4],
  stone: [6, 5],
};

export function isResourceTile(type: TileType): boolean {
  return RESOURCE_TYPES.has(type);
}
