import Phaser from 'phaser';
import { TILE_SIZE } from '../config/gameConfig';
import { GameNode, type NodeContext } from '../nodes';
import { backwallFrameForTile, atlasFrameForTile, tileKey, worldToTile } from '../utils/tileMath';
import { GravityDigLevelGenerator, type LevelData, type PlanetConfig, type TileCell } from './level';

export class LevelGeneratorManagerNode extends GameNode {
  private readonly generator = new GravityDigLevelGenerator();
  private planetConfig!: PlanetConfig;

  constructor() {
    super({ name: 'levelGenerator', order: 10 });
  }

  init(ctx: NodeContext): void {
    const config = ctx.phaserScene.cache.json.get('dev-planet') as PlanetConfig | undefined;
    if (!config) throw new Error('Planet config dev-planet is not loaded');

    this.planetConfig = config;
  }

  get config(): PlanetConfig {
    return this.planetConfig;
  }

  generateLevel(seed: number | string, difficultyLevel = 1): LevelData {
    return this.generator.generate(this.planetConfig, difficultyLevel, seed);
  }
}

export class LevelNode extends GameNode {
  private levelGenerator!: LevelGeneratorManagerNode;
  private phaserScene!: Phaser.Scene;
  private currentLevel?: LevelData;
  private tilemap?: Phaser.Tilemaps.Tilemap;
  private tileLayer?: Phaser.Tilemaps.TilemapLayer;
  private backwallTilemap?: Phaser.Tilemaps.Tilemap;
  private backwallLayer?: Phaser.Tilemaps.TilemapLayer;
  private mapOffsetXValue = 0;
  private mapOffsetYValue = 0;
  override readonly dependencies = ['levelGenerator'] as const;

  constructor() {
    super({ name: 'level', order: 0 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
  }

  resolve(): void {
    this.levelGenerator = this.requireNode<LevelGeneratorManagerNode>('levelGenerator');
  }

  destroy(): void {
    this.destroyTilemaps();
  }

  get level(): LevelData {
    if (!this.currentLevel) throw new Error('Level has not been generated yet');
    return this.currentLevel;
  }

  get mapOffsetX(): number {
    return this.mapOffsetXValue;
  }

  get mapOffsetY(): number {
    return this.mapOffsetYValue;
  }

  generate(seed: number | string, difficultyLevel = 1): LevelData {
    this.destroyTilemaps();
    this.currentLevel = this.levelGenerator.generateLevel(seed, difficultyLevel);
    this.drawTiles(this.currentLevel);
    return this.currentLevel;
  }

  getCell(tileX: number, tileY: number): TileCell | undefined {
    return this.level.tiles.get(tileKey(tileX, tileY));
  }

  getCellAtWorld(worldX: number, worldY: number): TileCell | undefined {
    return this.getCell(worldToTile(worldX), worldToTile(worldY));
  }

  isSolidAtWorld(worldX: number, worldY: number): boolean {
    if (this.isBehindShipNozzleWall(worldX, worldY)) return true;

    const cell = this.getCellAtWorld(worldX, worldY);
    return !!cell && cell.type !== 'air';
  }

  getBoxProbePoints(centerX: number, centerY: number, width: number, height: number): [number, number][] {
    const halfW = width / 2;
    const halfH = height / 2;
    return [
      [centerX - halfW, centerY - halfH],
      [centerX + halfW, centerY - halfH],
      [centerX - halfW, centerY + halfH],
      [centerX + halfW, centerY + halfH],
    ];
  }

  collidesBox(centerX: number, centerY: number, width: number, height: number): boolean {
    return this.getBoxProbePoints(centerX, centerY, width, height).some(([x, y]) => this.isSolidAtWorld(x, y));
  }

  clearTile(cell: TileCell): void {
    const localX = cell.x - this.mapOffsetXValue;
    const localY = cell.y - this.mapOffsetYValue;
    this.tilemap?.putTileAt(-1, localX, localY, false, this.tileLayer);

    cell.type = 'air';
    cell.health = 0;
    this.level.resources.delete(tileKey(cell.x, cell.y));
  }

  private drawTiles(level: LevelData): void {
    const cells = [...level.tiles.values()];
    const minX = Math.min(...cells.map((cell) => cell.x));
    const maxX = Math.max(...cells.map((cell) => cell.x));
    const minY = Math.min(...cells.map((cell) => cell.y));
    const maxY = Math.max(...cells.map((cell) => cell.y));
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const data = Array.from({ length: height }, () => Array.from({ length: width }, () => -1));
    const backwallData = Array.from({ length: height }, () => Array.from({ length: width }, () => -1));

    this.mapOffsetXValue = minX;
    this.mapOffsetYValue = minY;

    for (const cell of cells) {
      if (cell.type === 'air') continue;
      const localX = cell.x - minX;
      const localY = cell.y - minY;

      if (!cell.boundary) {
        backwallData[localY][localX] = backwallFrameForTile(cell.x, cell.y);
      }
      data[localY][localX] = atlasFrameForTile(cell.type, cell.x, cell.y);
    }

    this.backwallTilemap = this.phaserScene.make.tilemap({ data: backwallData, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const backwallTileset = this.backwallTilemap.addTilesetImage('backwall-tiles', 'backwall-tiles', TILE_SIZE, TILE_SIZE, 0, 0);
    if (!backwallTileset) throw new Error('Failed to create backwall tileset');
    const backwallLayer = this.backwallTilemap.createLayer(0, backwallTileset, minX * TILE_SIZE, minY * TILE_SIZE);
    if (!backwallLayer || backwallLayer instanceof Phaser.Tilemaps.TilemapGPULayer) throw new Error('Failed to create backwall tile layer');
    this.backwallLayer = backwallLayer.setDepth(0.6).setAlpha(0.88);

    this.tilemap = this.phaserScene.make.tilemap({ data, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = this.tilemap.addTilesetImage('tiles', 'tiles', TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) throw new Error('Failed to create tileset');

    const layer = this.tilemap.createLayer(0, tileset, minX * TILE_SIZE, minY * TILE_SIZE);
    if (!layer || layer instanceof Phaser.Tilemaps.TilemapGPULayer) throw new Error('Failed to create tile layer');
    this.tileLayer = layer.setDepth(2);
  }

  private destroyTilemaps(): void {
    this.tileLayer?.destroy();
    this.backwallLayer?.destroy();
    this.tilemap?.destroy();
    this.backwallTilemap?.destroy();
    this.tileLayer = undefined;
    this.backwallLayer = undefined;
    this.tilemap = undefined;
    this.backwallTilemap = undefined;
  }

  private isBehindShipNozzleWall(worldX: number, worldY: number): boolean {
    return worldX < -8.65 * TILE_SIZE && worldY >= -1.4 * TILE_SIZE && worldY <= 2.95 * TILE_SIZE;
  }
}
