import type { TileCell } from '../level';

export function applyMiningDamage(cell: TileCell, damagePerSecond: number, deltaSeconds: number): boolean {
  cell.health -= damagePerSecond * deltaSeconds;
  return cell.health <= 0;
}
