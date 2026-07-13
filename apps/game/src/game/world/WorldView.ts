import Phaser from 'phaser';
import type { LevelData } from '../level';

export class WorldView {
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  createDecorations(level: LevelData): Phaser.GameObjects.GameObject[] {
    return [
      this.createBackground(level),
      this.createStartTunnelBackground(level),
      ...this.createCoreMarker(level),
    ];
  }

  private createBackground(level: LevelData): Phaser.GameObjects.Graphics {
    const stars = this.scene.add.graphics().setScrollFactor(0.12);
    const rng = new Phaser.Math.RandomDataGenerator([String(level.seed)]);
    stars.fillStyle(0xffffff, 0.8);
    for (let i = 0; i < 180; i += 1) {
      stars.fillCircle(rng.integerInRange(-600, 5600), rng.integerInRange(-2800, 420), rng.realInRange(0.8, 2.4));
    }
    return stars;
  }

  private createStartTunnelBackground(level: LevelData): Phaser.GameObjects.Image {
    const rect = level.spaceshipRect;
    const tunnelLeftX = rect.x * level.tileSize;
    const tunnelTopY = (rect.y + 1) * level.tileSize;
    const tunnelWidth = rect.w * level.tileSize;
    const tunnelHeight = (rect.h - 2) * level.tileSize;

    return this.scene.add
      .image(tunnelLeftX + tunnelWidth / 2, tunnelTopY + tunnelHeight / 2, 'drill-tunnel-bg')
      .setOrigin(0.5)
            .setDisplaySize(tunnelWidth, tunnelHeight)
      .setAlpha(0.96);
  }

  private createCoreMarker(level: LevelData): Phaser.GameObjects.Arc[] {
    const { x, y, radius } = level.core;
    const tileSize = level.tileSize;
    return [
      this.scene.add.circle(x * tileSize + tileSize / 2, y * tileSize + tileSize / 2, radius * tileSize, 0x7c3aed, 0.08),
      this.scene.add.circle(x * tileSize + tileSize / 2, y * tileSize + tileSize / 2, 18, 0xf0abfc, 0.85),
    ];
  }
}
