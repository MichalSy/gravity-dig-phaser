import { WORLD_MIN_X } from './levelConstants';
import { distanceToCore, referenceCoreDistance } from './math';
import { setTile } from './tileMap';
import type { TileCell, TileType, WorldContext } from './types';

export function generateBaseTerrain(context: WorldContext, random: () => number): Map<string, TileCell> {
  const tiles = new Map<string, TileCell>();

  for (let x = WORLD_MIN_X; x <= context.width; x += 1) {
    for (let y = -context.heightDown; y <= context.heightUp; y += 1) {
      const type = calculateBaseTile(context, x, y, random);
      setTile(tiles, x, y, type, false);
    }
  }

  return tiles;
}

function calculateBaseTile(context: WorldContext, x: number, y: number, random: () => number): TileType {
  const distanceRatio = distanceToCore(context, x, y) / referenceCoreDistance(context);
  const absY = Math.abs(y);
  const roll = random();

  if (distanceRatio < 0.2) {
    if (roll < 0.62) return 'basalt';
    if (roll < 0.93) return 'stone';
    return absY < 24 ? 'gravel' : 'basalt';
  }

  if (distanceRatio < 0.4) {
    if (roll < 0.46) return 'stone';
    if (roll < 0.76) return 'basalt';
    if (roll < 0.88) return 'gravel';
    return 'dirt';
  }

  if (distanceRatio < 0.7) {
    if (roll < 0.45) return 'stone';
    if (roll < 0.65) return 'dirt';
    if (roll < 0.78) return 'gravel';
    if (roll < 0.9) return absY < 22 ? 'clay' : 'stone';
    return 'sand';
  }

  if (roll < 0.52) return 'dirt';
  if (roll < 0.68) return 'sand';
  if (roll < 0.8) return 'clay';
  if (roll < 0.9) return 'gravel';
  return 'stone';
}
