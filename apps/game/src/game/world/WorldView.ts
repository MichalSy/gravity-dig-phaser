import Phaser from 'phaser';
import { TILE_SIZE } from '../../config/gameConfig';
import type { LevelData } from '../level';
import {
  START_TUNNEL_HEIGHT_TILES,
  START_TUNNEL_LEFT_TILE,
  START_TUNNEL_TOP_TILE,
  START_TUNNEL_WIDTH_TILES,
} from './worldGeometry';

export class WorldView {
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  createDecorations(level: LevelData): Phaser.GameObjects.GameObject[] {
    return [
      this.createBackground(level),
      this.createStartTunnelBackground(),
      this.createShip(),
      ...this.createCoreMarker(level),
    ];
  }

  private createBackground(level: LevelData): Phaser.GameObjects.Graphics {
    const stars = this.scene.add.graphics().setDepth(-19).setScrollFactor(0.12);
    const rng = new Phaser.Math.RandomDataGenerator([String(level.seed)]);
    stars.fillStyle(0xffffff, 0.8);
    for (let i = 0; i < 180; i += 1) {
      stars.fillCircle(rng.integerInRange(-600, 5600), rng.integerInRange(-2800, 420), rng.realInRange(0.8, 2.4));
    }
    return stars;
  }

  private createStartTunnelBackground(): Phaser.GameObjects.Image {
    const tunnelLeftX = START_TUNNEL_LEFT_TILE * TILE_SIZE;
    const tunnelTopY = (START_TUNNEL_TOP_TILE + 1) * TILE_SIZE;
    const tunnelWidth = (START_TUNNEL_WIDTH_TILES - 1) * TILE_SIZE;
    const tunnelHeight = (START_TUNNEL_HEIGHT_TILES - 2) * TILE_SIZE;

    return this.scene.add
      .image(tunnelLeftX + tunnelWidth / 2, tunnelTopY + tunnelHeight / 2, 'drill-tunnel-bg')
      .setOrigin(0.5)
      .setDepth(1.5)
      .setDisplaySize(tunnelWidth, tunnelHeight)
      .setAlpha(0.96);
  }

  private createShip(): Phaser.GameObjects.Image {
    const shipBottomY = TILE_SIZE * 3;
    const shipCenterX = -3 * TILE_SIZE;

    return this.scene.add
      .image(shipCenterX, shipBottomY, 'ship')
      .setOrigin(0.5, 1)
      .setDepth(8)
      .setDisplaySize(TILE_SIZE * 5.71, TILE_SIZE * 3.5)
      .setAlpha(0.96);
  }

  private createCoreMarker(level: LevelData): Phaser.GameObjects.Arc[] {
    const { x, y, radius } = level.core;
    return [
      this.scene.add.circle(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, radius * TILE_SIZE, 0x7c3aed, 0.08).setDepth(1),
      this.scene.add.circle(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 18, 0xf0abfc, 0.85).setDepth(5),
    ];
  }
}
