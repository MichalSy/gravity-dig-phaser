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
  for (const [tileX, tileY] of getBoxProbeTiles(centerX, centerY, width, height)) {
    const probeX = tileX * TILE_SIZE + TILE_SIZE / 2;
    const probeY = tileY * TILE_SIZE + TILE_SIZE / 2;
    if (isBehindShipNozzleWall(probeX, probeY)) return true;

    const cell = getCell(level, tileX, tileY);
    if (cell && cell.type !== 'air') return true;
  }
  return false;
}

function getBoxProbeTiles(centerX: number, centerY: number, width: number, height: number): [number, number][] {
  const inset = 1;
  const halfW = Math.max(0, width / 2 - inset);
  const halfH = Math.max(0, height / 2 - inset);
  const left = worldToTile(centerX - halfW);
  const right = worldToTile(centerX + halfW);
  const top = worldToTile(centerY - halfH);
  const bottom = worldToTile(centerY + halfH);
  const tiles: [number, number][] = [];

  for (let tileY = top; tileY <= bottom; tileY += 1) {
    for (let tileX = left; tileX <= right; tileX += 1) {
      tiles.push([tileX, tileY]);
    }
  }

  return tiles;
}

function isBehindShipNozzleWall(worldX: number, worldY: number): boolean {
  return worldX < -8.65 * TILE_SIZE && worldY >= -1.4 * TILE_SIZE && worldY <= 2.95 * TILE_SIZE;
}
