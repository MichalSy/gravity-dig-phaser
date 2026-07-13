import { tileKey } from './tileMap';
import type { LevelData, TileCell } from './types';

export function getCell(level: LevelData, tileX: number, tileY: number): TileCell | undefined {
  return level.tiles.get(tileKey(tileX, tileY));
}

export function getCellAtWorld(level: LevelData, worldX: number, worldY: number): TileCell | undefined {
  return getCell(level, Math.floor(worldX / level.tileSize), Math.floor(worldY / level.tileSize));
}

export function collidesBox(level: LevelData, centerX: number, centerY: number, width: number, height: number): boolean {
  return getBoxProbePoints(centerX, centerY, width, height).some(([x, y]) => isSolidAtWorld(level, x, y));
}

function isSolidAtWorld(level: LevelData, worldX: number, worldY: number): boolean {
  if (isBehindShipNozzleWall(level, worldX, worldY)) return true;

  const cell = getCellAtWorld(level, worldX, worldY);
  return !!cell && cell.type !== 'air';
}

function getBoxProbePoints(centerX: number, centerY: number, width: number, height: number): [number, number][] {
  const halfW = width / 2;
  const halfH = height / 2;
  return [
    [centerX - halfW, centerY - halfH],
    [centerX + halfW, centerY - halfH],
    [centerX - halfW, centerY + halfH],
    [centerX + halfW, centerY + halfH],
  ];
}

function isBehindShipNozzleWall(level: LevelData, worldX: number, worldY: number): boolean {
  const rect = level.spaceshipRect;
  return worldX < (rect.x + 1.35) * level.tileSize
    && worldY >= (rect.y + 0.6) * level.tileSize
    && worldY <= (rect.y + rect.h - 1.05) * level.tileSize;
}
