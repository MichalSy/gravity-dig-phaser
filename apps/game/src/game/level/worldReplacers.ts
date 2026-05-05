import {
  LEFT_BOUNDARY_THICKNESS,
  SHIP_CEILING_Y,
  SHIP_FLOOR_Y,
  SHIP_TUNNEL_BOTTOM_Y,
  SHIP_TUNNEL_LEFT_X,
  SHIP_TUNNEL_TIP_X,
  SHIP_TUNNEL_TOP_Y,
  WORLD_MIN_X,
} from './levelConstants';
import { setTile, tileKey } from './tileMap';
import type { ResourceProfile, TileCell, WorldContext } from './types';

type LevelReplacer = (context: WorldContext, tiles: Map<string, TileCell>) => void;

export function applyWorldReplacers(context: WorldContext, tiles: Map<string, TileCell>): void {
  const replacers: LevelReplacer[] = [
    applyStartAndShipChamber,
    applyStarterResourceDeposits,
    applyCore,
    applyWorldBoundaries,
  ];

  for (const replacer of replacers) replacer(context, tiles);
}

function applyStartAndShipChamber(_context: WorldContext, tiles: Map<string, TileCell>): void {
  // The Bucket drilled in from the left: carve only the hot bore tunnel up to the drill tip.
  // The ceiling and floor remain fused bedrock, so the ship reads as embedded in the planet.
  for (let x = SHIP_TUNNEL_LEFT_X; x <= SHIP_TUNNEL_TIP_X; x += 1) {
    setTile(tiles, x, SHIP_CEILING_Y, 'bedrock', true);
    setTile(tiles, x, SHIP_FLOOR_Y, 'bedrock', true);

    for (let y = SHIP_TUNNEL_TOP_Y; y <= SHIP_TUNNEL_BOTTOM_Y; y += 1) {
      setTile(tiles, x, y, 'air', false);
    }
  }
}

function applyStarterResourceDeposits(context: WorldContext, tiles: Map<string, TileCell>): void {
  // Keep the landing tunnel clean, but make the new resource tiles visible early.
  if (context.config.planet.id !== 'dev_planet') return;

  const deposits: Array<{ type: ResourceProfile['type']; cells: Array<[number, number]> }> = [
    { type: 'copper', cells: [[4, 1], [5, 1], [5, 2], [6, 1], [6, 2]] },
    { type: 'iron', cells: [[8, -4], [9, -4], [9, -3], [10, -4], [10, -3]] },
    { type: 'gold', cells: [[10, 5], [11, 5], [11, 6], [12, 5]] },
    { type: 'diamond', cells: [[16, -8], [17, -8], [17, -7]] },
  ];

  for (const deposit of deposits) {
    for (const [x, y] of deposit.cells) {
      const cell = tiles.get(tileKey(x, y));
      if (!cell || cell.type === 'air' || cell.type === 'bedrock' || cell.boundary) continue;
      setTile(tiles, x, y, deposit.type, false);
    }
  }
}

function applyCore(context: WorldContext, tiles: Map<string, TileCell>): void {
  const { x: cx, y: cy, radius } = context.core;
  const radiusSq = radius ** 2;

  for (let x = cx - radius; x <= cx + radius; x += 1) {
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radiusSq) {
        setTile(tiles, x, y, 'bedrock', true);
      }
    }
  }
}

function applyWorldBoundaries(context: WorldContext, tiles: Map<string, TileCell>): void {
  for (let x = WORLD_MIN_X; x <= context.width; x += 1) {
    setTile(tiles, x, context.heightUp + 1, 'bedrock', true);
    setTile(tiles, x, -context.heightDown - 1, 'bedrock', true);
  }

  for (let y = -context.heightDown; y <= context.heightUp; y += 1) {
    for (let x = WORLD_MIN_X; x < WORLD_MIN_X + LEFT_BOUNDARY_THICKNESS; x += 1) {
      if (y >= SHIP_TUNNEL_TOP_Y && y <= SHIP_TUNNEL_BOTTOM_Y) continue;
      setTile(tiles, x, y, 'bedrock', true);
    }
    setTile(tiles, context.width + 1, y, 'bedrock', true);
  }
}
