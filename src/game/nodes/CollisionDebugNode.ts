import Phaser from 'phaser';
import { PLAYER_SIZE, TILE_SIZE } from '../../config/gameConfig';
import { GameNode, type NodeContext } from '../../nodes';
import { worldToTile } from '../../utils/tileMath';
import { GAME_EVENTS, offGameEvent, onGameEvent } from '../gameEvents';
import { createCollisionDebugData, type CollisionDebugData } from '../nodeData';
import { LevelNode } from './LevelNode';
import { GameWorldNode } from './GameWorldNode';

export class CollisionDebugNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private world!: GameWorldNode;
  private levelNode!: LevelNode;
  private debugGraphics?: Phaser.GameObjects.Graphics;
  override readonly dependencies = ['world', 'level'] as const;
  readonly data: CollisionDebugData = createCollisionDebugData();

  constructor() {
    super({ name: 'collisionDebug', order: 40 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.debugGraphics = this.phaserScene.add.graphics().setDepth(45);
    onGameEvent(this.phaserScene, GAME_EVENTS.debugCollision, this.setEnabled, this);
    onGameEvent(this.phaserScene, GAME_EVENTS.worldLevelCreated, this.resetForLevel, this);
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('world');
    this.levelNode = this.requireNode<LevelNode>('level');
  }

  destroy(): void {
    offGameEvent(this.phaserScene, GAME_EVENTS.debugCollision, this.setEnabled, this);
    offGameEvent(this.phaserScene, GAME_EVENTS.worldLevelCreated, this.resetForLevel, this);
    this.debugGraphics?.destroy();
  }

  update(): void {
    if (!this.debugGraphics) return;
    this.debugGraphics.clear();
    if (!this.data.enabled) return;

    const player = this.world.player;
    const halfW = PLAYER_SIZE.w / 2;
    const halfH = PLAYER_SIZE.h / 2;
    const left = player.x - halfW;
    const top = player.y - halfH;
    const probes = this.levelNode.getBoxProbePoints(player.x, player.y, PLAYER_SIZE.w, PLAYER_SIZE.h);

    this.debugGraphics.lineStyle(2, 0x22c55e, 1);
    this.debugGraphics.strokeRect(left, top, PLAYER_SIZE.w, PLAYER_SIZE.h);
    this.debugGraphics.fillStyle(0x22c55e, 0.35);
    this.debugGraphics.fillRect(left, top, PLAYER_SIZE.w, PLAYER_SIZE.h);

    for (const [x, y] of probes) {
      const hit = this.levelNode.isSolidAtWorld(x, y);
      this.debugGraphics.fillStyle(hit ? 0xef4444 : 0xfacc15, 1);
      this.debugGraphics.fillCircle(x, y, 4);
    }

    const minTx = worldToTile(player.x - TILE_SIZE * 2);
    const maxTx = worldToTile(player.x + TILE_SIZE * 2);
    const minTy = worldToTile(player.y - TILE_SIZE * 2);
    const maxTy = worldToTile(player.y + TILE_SIZE * 2);
    this.debugGraphics.lineStyle(1, 0xef4444, 0.5);
    for (let ty = minTy; ty <= maxTy; ty += 1) {
      for (let tx = minTx; tx <= maxTx; tx += 1) {
        const cell = this.levelNode.getCell(tx, ty);
        if (!cell || cell.type === 'air') continue;
        this.debugGraphics.strokeRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  private setEnabled(enabled: boolean): void {
    this.data.enabled = enabled;
    if (!enabled) this.debugGraphics?.clear();
  }

  private resetForLevel(): void {
    this.debugGraphics?.clear();
  }
}
