import Phaser from 'phaser';
import { TILE_SIZE } from '../../config/gameConfig';
import { tileKey } from '../../utils/tileMath';
import { isResourceTile, type TileCell, type TileType } from '../level';

export class MiningLaserView {
  private readonly scene: Phaser.Scene;
  private laser!: Phaser.GameObjects.Graphics;
  private targetMarker!: Phaser.GameObjects.Rectangle;
  private laserSound?: Phaser.Sound.BaseSound;
  private readonly crackOverlays = new Map<string, Phaser.GameObjects.Image>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  mount(): void {
    this.laser = this.scene.add.graphics();
    this.targetMarker = this.scene.add
      .rectangle(0, 0, TILE_SIZE, TILE_SIZE)
      .setStrokeStyle(3, 0xf97316, 0.95)
      .setVisible(false)
      ;
    this.laserSound = this.scene.sound.add('laser-loop', { loop: true, volume: 0.28 });
  }

  getSceneObjects(): Phaser.GameObjects.GameObject[] {
    return [this.targetMarker, ...this.crackOverlays.values(), this.laser];
  }

  resetForLevel(): void {
    for (const overlay of this.crackOverlays.values()) overlay.destroy();
    this.crackOverlays.clear();
    this.clear();
  }

  clear(): void {
    this.laser?.clear();
    this.targetMarker?.setVisible(false);
    this.setLaserSound(false);
  }

  showTargetAndBeam(target: TileCell, origin: Phaser.Math.Vector2, firing: boolean): void {
    this.targetMarker.setPosition(target.x * TILE_SIZE + TILE_SIZE / 2, target.y * TILE_SIZE + TILE_SIZE / 2).setVisible(true);
    this.laser.lineStyle(firing ? 4 : 2, firing ? 0xf43f5e : 0xfb7185, firing ? 0.95 : 0.5);
    this.laser.lineBetween(origin.x, origin.y, target.x * TILE_SIZE + TILE_SIZE / 2, target.y * TILE_SIZE + TILE_SIZE / 2);
  }

  setLaserSound(active: boolean): void {
    if (!this.laserSound) return;
    if (active) {
      if (!this.laserSound.isPlaying) this.laserSound.play();
      return;
    }
    if (this.laserSound.isPlaying) this.laserSound.stop();
  }

  updateCrackOverlay(cell: TileCell): void {
    const key = tileKey(cell.x, cell.y);
    const damage = Phaser.Math.Clamp(1 - cell.health / cell.maxHealth, 0, 1);
    const stage = Math.min(4, Math.max(1, Math.ceil(damage * 4)));
    let overlay = this.crackOverlays.get(key);

    if (!overlay) {
      overlay = this.scene.add
        .image(cell.x * TILE_SIZE + TILE_SIZE / 2, cell.y * TILE_SIZE + TILE_SIZE / 2, `crack-${stage}`)
        .setOrigin(0.5)
        .setDisplaySize(TILE_SIZE, TILE_SIZE)
        ;
      this.crackOverlays.set(key, overlay);
      return;
    }

    overlay.setTexture(`crack-${stage}`);
  }

  removeCrackOverlay(cell: TileCell): void {
    const key = tileKey(cell.x, cell.y);
    this.crackOverlays.get(key)?.destroy();
    this.crackOverlays.delete(key);
  }

  playBlockBreakSound(type: TileType): void {
    const isGemBreak = isResourceTile(type);
    this.scene.sound.play(isGemBreak ? 'block-break-gem' : 'block-break-dirt', {
      volume: isGemBreak ? 0.52 : 0.42,
      detune: Phaser.Math.Between(-45, 45),
    });
  }

  destroy(): void {
    this.resetForLevel();
    this.targetMarker?.destroy();
    this.laser?.destroy();
    this.setLaserSound(false);
    this.laserSound?.destroy();
  }
}
