import { TILE_SIZE } from '../../config/gameConfig';
import { tileKey, worldToTile } from '../../utils/tileMath';
import type { LevelData, TileCell } from './types';

export function getCell(level: LevelData, tileX: number, tileY: number): TileCell | undefined {
  return level.tiles.get(tileKey(tileX, tileY));
}

export function getCellAtWorld(level: LevelData, worldX: number, worldY: number): TileCell | undefined {
  return getCell(level, worldToTile(worldX), worldToTile(worldY));
}

export function collidesBox(level: LevelData, centerX: number, centerY: number, width: number, height: number): boolean {
  return getBoxProbePoints(centerX, centerY, width, height).some(([x, y]) => isSolidAtWorld(level, x, y));
}

function isSolidAtWorld(level: LevelData, worldX: number, worldY: number): boolean {
  if (isBehindShipNozzleWall(worldX, worldY)) return true;

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

function isBehindShipNozzleWall(worldX: number, worldY: number): boolean {
  return worldX < -8.65 * TILE_SIZE && worldY >= -1.4 * TILE_SIZE && worldY <= 2.95 * TILE_SIZE;
}
