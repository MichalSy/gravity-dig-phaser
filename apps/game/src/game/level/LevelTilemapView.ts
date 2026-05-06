import Phaser from 'phaser';
import { TILE_SIZE } from '../../config/gameConfig';
import { backwallFrameForTile, atlasFrameForTile } from '../../utils/tileMath';
import type { LevelData, TileCell } from './types';

export class LevelTilemapView {
  private readonly scene: Phaser.Scene;
  private tilemap?: Phaser.Tilemaps.Tilemap;
  private tileLayer?: Phaser.Tilemaps.TilemapLayer;
  private backwallTilemap?: Phaser.Tilemaps.Tilemap;
  private backwallLayer?: Phaser.Tilemaps.TilemapLayer;
  private mapOffsetX = 0;
  private mapOffsetY = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get offsetX(): number {
    return this.mapOffsetX;
  }

  get offsetY(): number {
    return this.mapOffsetY;
  }

  draw(level: LevelData): void {
    this.destroy();

    const cells = [...level.tiles.values()];
    const minX = Math.min(...cells.map((cell) => cell.x));
    const maxX = Math.max(...cells.map((cell) => cell.x));
    const minY = Math.min(...cells.map((cell) => cell.y));
    const maxY = Math.max(...cells.map((cell) => cell.y));
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const data = Array.from({ length: height }, () => Array.from({ length: width }, () => -1));
    const backwallData = Array.from({ length: height }, () => Array.from({ length: width }, () => -1));

    this.mapOffsetX = minX;
    this.mapOffsetY = minY;

    for (const cell of cells) {
      if (cell.type === 'air') continue;
      const localX = cell.x - minX;
      const localY = cell.y - minY;

      if (!cell.boundary) backwallData[localY][localX] = backwallFrameForTile(cell.x, cell.y);
      data[localY][localX] = atlasFrameForTile(cell.type, cell.x, cell.y);
    }

    this.drawBackwall(backwallData, minX, minY);
    this.drawForeground(data, minX, minY);
  }

  clearTile(cell: TileCell): void {
    this.tilemap?.putTileAt(-1, cell.x - this.mapOffsetX, cell.y - this.mapOffsetY, false, this.tileLayer);
  }

  getSceneObjects(): Phaser.GameObjects.GameObject[] {
    return [this.backwallLayer, this.tileLayer].filter((object) => object !== undefined) as Phaser.GameObjects.GameObject[];
  }

  destroy(): void {
    this.tileLayer?.destroy();
    this.backwallLayer?.destroy();
    this.tilemap?.destroy();
    this.backwallTilemap?.destroy();
    this.tileLayer = undefined;
    this.backwallLayer = undefined;
    this.tilemap = undefined;
    this.backwallTilemap = undefined;
  }

  private drawBackwall(data: number[][], minX: number, minY: number): void {
    this.backwallTilemap = this.scene.make.tilemap({ data, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = this.backwallTilemap.addTilesetImage('backwall-tiles', 'backwall-tiles', TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) throw new Error('Failed to create backwall tileset');

    const layer = this.backwallTilemap.createLayer(0, tileset, minX * TILE_SIZE, minY * TILE_SIZE);
    if (!layer || layer instanceof Phaser.Tilemaps.TilemapGPULayer) throw new Error('Failed to create backwall tile layer');
    this.backwallLayer = layer.setAlpha(0.88);
  }

  private drawForeground(data: number[][], minX: number, minY: number): void {
    this.tilemap = this.scene.make.tilemap({ data, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = this.tilemap.addTilesetImage('tiles', 'tiles', TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) throw new Error('Failed to create tileset');

    const layer = this.tilemap.createLayer(0, tileset, minX * TILE_SIZE, minY * TILE_SIZE);
    if (!layer || layer instanceof Phaser.Tilemaps.TilemapGPULayer) throw new Error('Failed to create tile layer');
    this.tileLayer = layer;
  }
}
