import Phaser from 'phaser';
import type { TileCell } from '../level';

export interface MiningTargetingArgs {
  origin: Phaser.Math.Vector2;
  aimWorld: Phaser.Math.Vector2;
  range: number;
  getCellAtWorld(x: number, y: number): TileCell | undefined;
}

export function findFirstMineableTile(args: MiningTargetingArgs): TileCell | undefined {
  const dir = args.aimWorld.clone().subtract(args.origin);
  if (dir.lengthSq() <= 1) return undefined;
  dir.normalize();

  for (let distance = 8; distance <= args.range; distance += 8) {
    const x = args.origin.x + dir.x * distance;
    const y = args.origin.y + dir.y * distance;
    const cell = args.getCellAtWorld(x, y);
    if (cell?.type && cell.type !== 'air') {
      return cell.type === 'bedrock' ? undefined : cell;
    }
  }
  return undefined;
}
