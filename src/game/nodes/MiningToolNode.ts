import Phaser from 'phaser';
import { GameplayInputNode } from '../../app/nodes';
import { PLAYER_SIZE, TILE_SIZE } from '../../config/gameConfig';
import { GameNode, type NodeContext } from '../../nodes';
import { tileKey } from '../../utils/tileMath';
import { GAME_EVENTS, offGameEvent, onGameEvent } from '../gameEvents';
import { isResourceTile, type TileCell, type TileType } from '../level';
import { createMiningToolData, type MiningToolData } from '../nodeData';
import type { GameWorldNode } from './GameWorldNode';
import { LevelNode } from './LevelNode';
import { PlayerControllerNode } from './PlayerControllerNode';
import { PlayerStateManagerNode } from './PlayerStateManagerNode';

export class MiningToolNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private levelNode!: LevelNode;
  private world!: GameWorldNode;
  private playerController!: PlayerControllerNode;
  private playerState!: PlayerStateManagerNode;
  private gameplayInput!: GameplayInputNode;
  private laser!: Phaser.GameObjects.Graphics;
  private targetMarker!: Phaser.GameObjects.Rectangle;
  private laserSound?: Phaser.Sound.BaseSound;
  private miningPressed = false;
  private readonly crackOverlays = new Map<string, Phaser.GameObjects.Image>();
  override readonly dependencies = ['level', 'world', 'playerController', 'playerState', 'gameplayInput'] as const;
  readonly data: MiningToolData = createMiningToolData();

  constructor() {
    super({ name: 'miningTool', order: 20 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.laser = this.phaserScene.add.graphics().setDepth(30);
    this.targetMarker = this.phaserScene.add
      .rectangle(0, 0, TILE_SIZE, TILE_SIZE)
      .setStrokeStyle(3, 0xf97316, 0.95)
      .setVisible(false)
      .setDepth(25);
    this.laserSound = this.phaserScene.sound.add('laser-loop', { loop: true, volume: 0.28 });
    onGameEvent(this.phaserScene, GAME_EVENTS.gameplayMenuOpened, this.stopFiring, this);
  }

  resolve(): void {
    this.levelNode = this.requireNode<LevelNode>('level');
    this.world = this.requireNode<GameWorldNode>('world');
    this.playerController = this.requireNode<PlayerControllerNode>('playerController');
    this.playerState = this.requireNode<PlayerStateManagerNode>('playerState');
    this.gameplayInput = this.requireNode<GameplayInputNode>('gameplayInput');
  }

  destroy(): void {
    offGameEvent(this.phaserScene, GAME_EVENTS.gameplayMenuOpened, this.stopFiring, this);
    this.resetForLevel();
    this.targetMarker?.destroy();
    this.laser?.destroy();
    this.setLaserSound(false);
    this.laserSound?.destroy();
  }

  get target(): TileCell | undefined {
    return this.data.target;
  }

  resetForLevel(): void {
    for (const overlay of this.crackOverlays.values()) overlay.destroy();
    this.crackOverlays.clear();
    this.stopFiring();
  }

  stopFiring(): void {
    this.data.target = undefined;
    this.miningPressed = false;
    this.laser?.clear();
    this.targetMarker?.setVisible(false);
    this.setLaserSound(false);
  }

  update(deltaMs: number): void {
    this.updateMining(deltaMs / 1000);
  }

  updateMining(deltaSeconds: number): void {
    const origin = this.getLaserOrigin();
    const intent = this.gameplayInput.getMiningIntent({
      playerX: this.world.player.x,
      playerY: this.world.player.y + PLAYER_SIZE.h * 0.18,
      inputBlocked: this.playerController.inputBlocked,
      miningRange: this.playerState.stats.miningRange,
      gamepadAim: this.data.gamepadAim,
      laserOrigin: origin,
    });
    const aimWorld = this.getAimWorldPoint(intent.aimWorld);
    const target = this.findFirstMineableTile(aimWorld, origin);
    const firing = intent.miningPressed;
    this.miningPressed = firing;

    this.laser.clear();
    this.targetMarker.setVisible(false);
    this.data.target = target;

    if (!target) {
      this.setLaserSound(false);
      return;
    }

    this.targetMarker.setPosition(target.x * TILE_SIZE + TILE_SIZE / 2, target.y * TILE_SIZE + TILE_SIZE / 2).setVisible(true);
    this.laser.lineStyle(firing ? 4 : 2, firing ? 0xf43f5e : 0xfb7185, firing ? 0.95 : 0.5);
    this.laser.lineBetween(origin.x, origin.y, target.x * TILE_SIZE + TILE_SIZE / 2, target.y * TILE_SIZE + TILE_SIZE / 2);

    if (!firing || !this.playerState.hasMiningEnergy()) {
      this.setLaserSound(false);
      return;
    }

    this.setLaserSound(true);
    this.playerState.consumeMiningEnergy(deltaSeconds);
    target.health -= this.playerState.stats.miningDamagePerSec * deltaSeconds;
    this.updateCrackOverlay(target);

    if (target.health <= 0) {
      const destroyedType = target.type;
      this.mineTile(target);
      this.playBlockBreakSound(destroyedType);
    }
  }

  isMiningPressed(): boolean {
    return this.miningPressed;
  }

  getAimWorldPoint(aimWorld?: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    if (aimWorld) this.data.currentAimWorld.copy(aimWorld);
    return this.data.currentAimWorld;
  }

  private findFirstMineableTile(aimWorld: Phaser.Math.Vector2, origin: Phaser.Math.Vector2): TileCell | undefined {
    const dir = aimWorld.clone().subtract(origin);
    if (dir.lengthSq() <= 1) return undefined;
    dir.normalize();

    for (let distance = 8; distance <= this.playerState.stats.miningRange; distance += 8) {
      const x = origin.x + dir.x * distance;
      const y = origin.y + dir.y * distance;
      const cell = this.levelNode.getCellAtWorld(x, y);
      if (cell?.type && cell.type !== 'air') {
        return cell.type === 'bedrock' ? undefined : cell;
      }
    }
    return undefined;
  }

  private getLaserOrigin(): Phaser.Math.Vector2 {
    return this.data.laserOrigin.set(this.world.player.x, this.world.player.y + PLAYER_SIZE.h * 0.18);
  }

  private setLaserSound(active: boolean): void {
    if (!this.laserSound) return;
    if (active) {
      if (!this.laserSound.isPlaying) this.laserSound.play();
      return;
    }
    if (this.laserSound.isPlaying) this.laserSound.stop();
  }

  private updateCrackOverlay(cell: TileCell): void {
    const key = tileKey(cell.x, cell.y);
    const damage = Phaser.Math.Clamp(1 - cell.health / cell.maxHealth, 0, 1);
    const stage = Math.min(4, Math.max(1, Math.ceil(damage * 4)));
    let overlay = this.crackOverlays.get(key);

    if (!overlay) {
      overlay = this.phaserScene.add
        .image(cell.x * TILE_SIZE + TILE_SIZE / 2, cell.y * TILE_SIZE + TILE_SIZE / 2, `crack-${stage}`)
        .setOrigin(0.5)
        .setDisplaySize(TILE_SIZE, TILE_SIZE)
        .setDepth(6);
      this.crackOverlays.set(key, overlay);
      return;
    }

    overlay.setTexture(`crack-${stage}`);
  }

  private mineTile(cell: TileCell): void {
    const key = tileKey(cell.x, cell.y);
    const minedType = cell.type;

    this.levelNode.clearTile(cell);
    this.crackOverlays.get(key)?.destroy();
    this.crackOverlays.delete(key);

    this.playerState.recordMinedTile(minedType);
  }

  private playBlockBreakSound(type: TileType): void {
    const isGemBreak = isResourceTile(type);
    this.phaserScene.sound.play(isGemBreak ? 'block-break-gem' : 'block-break-dirt', {
      volume: isGemBreak ? 0.52 : 0.42,
      detune: Phaser.Math.Between(-45, 45),
    });
  }
}
