import { GameNode, type NodeContext } from '../../nodes';
import { tileKey } from '../../utils/tileMath';
import type { LevelData, TileCell } from '../level';
import { collidesBox, getCellAtWorld } from '../level/levelCollision';
import { LevelTilemapView } from '../level/LevelTilemapView';
import { LevelGeneratorManagerNode } from './LevelGeneratorManagerNode';

export class LevelNode extends GameNode {
  private levelGenerator!: LevelGeneratorManagerNode;
  private tilemapView!: LevelTilemapView;
  private currentLevel?: LevelData;
  override readonly dependencies = ['LevelGenerator'] as const;

  constructor() {
    super({ name: 'Level', order: 0, className: 'LevelNode' });
  }

  init(ctx: NodeContext): void {
    this.tilemapView = new LevelTilemapView(ctx.phaserScene);
  }

  resolve(): void {
    this.levelGenerator = this.requireNode<LevelGeneratorManagerNode>('LevelGenerator');
  }

  destroy(): void {
    this.tilemapView?.destroy();
  }

  get level(): LevelData {
    if (!this.currentLevel) throw new Error('Level has not been generated yet');
    return this.currentLevel;
  }

  get mapOffsetX(): number {
    return this.tilemapView.offsetX;
  }

  get mapOffsetY(): number {
    return this.tilemapView.offsetY;
  }

  generate(seed: number | string, difficultyLevel = 1): LevelData {
    this.currentLevel = this.levelGenerator.generateLevel(seed, difficultyLevel);
    this.tilemapView.draw(this.currentLevel);
    return this.currentLevel;
  }

  getCell(tileX: number, tileY: number): TileCell | undefined {
    return this.level.tiles.get(tileKey(tileX, tileY));
  }

  getCellAtWorld(worldX: number, worldY: number): TileCell | undefined {
    return getCellAtWorld(this.level, worldX, worldY);
  }

  collidesBox(centerX: number, centerY: number, width: number, height: number): boolean {
    return collidesBox(this.level, centerX, centerY, width, height);
  }

  clearTile(cell: TileCell): void {
    this.tilemapView.clearTile(cell);
    cell.type = 'air';
    cell.health = 0;
    this.level.resources.delete(tileKey(cell.x, cell.y));
  }
}
