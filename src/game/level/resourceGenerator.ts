import { clamp, distanceToCore, distanceToStart, referenceCoreDistance } from './math';
import { randomInt } from './random';
import { setTile, tileKey } from './tileMap';
import { isResourceTile } from './tileTypes';
import type { ResourceProfile, TileCell, TileType, WorldContext } from './types';

const RESOURCE_PROFILES: ResourceProfile[] = [
  { type: 'copper', minCoreRatio: 0.48, maxCoreRatio: Infinity, minAbsY: 0, baseChance: 0.032, veinMin: 3, veinMax: 7 },
  { type: 'iron', minCoreRatio: 0.34, maxCoreRatio: Infinity, minAbsY: 6, baseChance: 0.027, veinMin: 3, veinMax: 7 },
  { type: 'gold', minCoreRatio: 0.16, maxCoreRatio: 0.72, minAbsY: 12, baseChance: 0.019, veinMin: 2, veinMax: 6 },
  { type: 'diamond', minCoreRatio: 0.05, maxCoreRatio: 0.45, minAbsY: 22, baseChance: 0.01, veinMin: 2, veinMax: 4 },
];

export function spawnResources(context: WorldContext, tiles: Map<string, TileCell>, random: () => number): void {
  const richness = context.scaled.resource_richness ?? 1;

  for (const cell of tiles.values()) {
    if (!canReplaceWithResource(cell)) continue;
    if (distanceToStart(context, cell.x, cell.y) < 10) continue;

    const profile = pickResourceForCell(context, cell, richness, random);
    if (!profile) continue;

    const veinSize = randomInt(random, profile.veinMin, profile.veinMax);
    spawnVein(cell.x, cell.y, profile.type, veinSize, context, tiles, random);
  }
}

export function rebuildResources(tiles: Map<string, TileCell>): Map<string, TileType> {
  const resources = new Map<string, TileType>();

  for (const cell of tiles.values()) {
    if (isResourceTile(cell.type)) resources.set(tileKey(cell.x, cell.y), cell.type);
  }

  return resources;
}

function pickResourceForCell(context: WorldContext, cell: TileCell, richness: number, random: () => number): ResourceProfile | undefined {
  const coreDistance = distanceToCore(context, cell.x, cell.y);
  const coreRatio = coreDistance / referenceCoreDistance(context);
  const absY = Math.abs(cell.y);
  const possible = RESOURCE_PROFILES.filter(
    (profile) =>
      coreRatio >= profile.minCoreRatio &&
      coreRatio <= profile.maxCoreRatio &&
      absY >= profile.minAbsY,
  );

  if (possible.length === 0) return undefined;

  const zonePressure = clamp(1.55 - coreRatio, 0.55, 1.45);
  const depthPressure = clamp(0.75 + absY / 160, 0.75, 1.6);

  for (const profile of possible) {
    const rarityFactor = profile.type === 'diamond' ? 0.68 : profile.type === 'gold' ? 0.84 : 1;
    const chance = profile.baseChance * richness * zonePressure * depthPressure * rarityFactor;
    if (random() < chance) return profile;
  }

  return undefined;
}

function spawnVein(
  startX: number,
  startY: number,
  type: ResourceProfile['type'],
  size: number,
  context: WorldContext,
  tiles: Map<string, TileCell>,
  random: () => number,
): void {
  let x = startX;
  let y = startY;

  for (let i = 0; i < size; i += 1) {
    const cell = tiles.get(tileKey(x, y));
    if (cell && canReplaceWithResource(cell) && distanceToStart(context, x, y) >= 10) {
      setTile(tiles, x, y, type, false);
    }

    x += randomInt(random, -1, 1);
    y += randomInt(random, -1, 1);
  }
}

function canReplaceWithResource(cell: TileCell): boolean {
  return (cell.type === 'dirt' || cell.type === 'stone' || cell.type === 'basalt') && !cell.boundary;
}
