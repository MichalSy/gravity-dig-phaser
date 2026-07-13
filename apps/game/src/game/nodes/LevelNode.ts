import type Phaser from 'phaser';
import { NODE_TYPE_IDS, GameNode, type GameNodeOptions, type NodeContext } from '../../nodes';
import type { LevelData, TileCell } from '../level';
import { LevelTilemapView } from '../level/LevelTilemapView';
interface LevelGeneratorTarget extends GameNode {
  callScriptMethod(name: string, ...args: unknown[]): unknown;
}

export class LevelNode extends GameNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.LevelNode;

  private levelGenerator!: LevelGeneratorTarget;
  private tilemapView!: LevelTilemapView;
  private currentLevel?: LevelData;
  override readonly dependencies = ['LevelGenerator'] as const;

  constructor(options: GameNodeOptions = {}) {
    super({ name: 'Level', className: 'LevelNode', ...options });
  }

  init(ctx: NodeContext): void {
    this.tilemapView = new LevelTilemapView(ctx.phaserScene);
  }

  resolve(): void {
    this.levelGenerator = this.requireNode<LevelGeneratorTarget>('LevelGenerator');
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    return this.getSceneObjects();
  }

  getSceneObjects(): Phaser.GameObjects.GameObject[] {
    return this.tilemapView.getSceneObjects();
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
    this.currentLevel = this.levelGenerator.callScriptMethod('generateLevel', seed, difficultyLevel) as LevelData;
    if (!this.currentLevel) throw new Error('LevelManager did not return level data');
    this.tilemapView.draw(this.currentLevel);
    return this.currentLevel;
  }

  getCell(tileX: number, tileY: number): TileCell | undefined {
    return this.levelGenerator.callScriptMethod('getCell', this.level, tileX, tileY) as TileCell | undefined;
  }

  getCellAtWorld(worldX: number, worldY: number): TileCell | undefined {
    return this.levelGenerator.callScriptMethod('getCellAtWorld', this.level, worldX, worldY) as TileCell | undefined;
  }

  collidesBox(centerX: number, centerY: number, width: number, height: number): boolean {
    return this.levelGenerator.callScriptMethod('collidesBox', this.level, centerX, centerY, width, height) === true;
  }

  clearTile(cell: TileCell): void {
    const cleared = this.levelGenerator.callScriptMethod('clearTile', this.level, cell.x, cell.y) === true;
    if (cleared) this.tilemapView.clearTile(cell);
  }
}
