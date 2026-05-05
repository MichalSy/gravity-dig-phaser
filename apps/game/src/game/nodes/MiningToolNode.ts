import Phaser from 'phaser';
import { GameplayInputNode } from '../../app/nodes';
import { PLAYER_SIZE } from '../../config/gameConfig';
import { GameNode, type NodeContext } from '../../nodes';
import { GAME_EVENTS, offGameEvent, onGameEvent } from '../gameEvents';
import { applyMiningDamage } from '../mining/miningDamage';
import { MiningLaserView } from '../mining/MiningLaserView';
import { findFirstMineableTile } from '../mining/miningTargeting';
import type { TileCell } from '../level';
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
  private laserView!: MiningLaserView;
  private miningPressed = false;
  override readonly dependencies = ['level', 'world', 'playerController', 'playerState', 'gameplayInput'] as const;
  readonly data: MiningToolData = createMiningToolData();

  constructor() {
    super({ name: 'miningTool', order: 20 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.laserView = new MiningLaserView(this.phaserScene);
    this.laserView.mount();
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
    this.laserView?.destroy();
  }

  get target(): TileCell | undefined {
    return this.data.target;
  }

  resetForLevel(): void {
    this.laserView.resetForLevel();
    this.stopFiring();
  }

  stopFiring(): void {
    this.data.target = undefined;
    this.miningPressed = false;
    this.laserView?.clear();
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
    const target = findFirstMineableTile({
      origin,
      aimWorld,
      range: this.playerState.stats.miningRange,
      getCellAtWorld: (x, y) => this.levelNode.getCellAtWorld(x, y),
    });
    const firing = intent.miningPressed;
    this.miningPressed = firing;
    this.data.target = target;
    this.laserView.clear();

    if (!target) return;

    this.laserView.showTargetAndBeam(target, origin, firing);

    if (!firing || !this.playerState.hasMiningEnergy()) return;

    this.laserView.setLaserSound(true);
    this.playerState.consumeMiningEnergy(deltaSeconds);
    const destroyed = applyMiningDamage(target, this.playerState.stats.miningDamagePerSec, deltaSeconds);
    this.laserView.updateCrackOverlay(target);

    if (destroyed) this.mineTile(target);
  }

  isMiningPressed(): boolean {
    return this.miningPressed;
  }

  getAimWorldPoint(aimWorld?: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    if (aimWorld) this.data.currentAimWorld.copy(aimWorld);
    return this.data.currentAimWorld;
  }

  private getLaserOrigin(): Phaser.Math.Vector2 {
    return this.data.laserOrigin.set(this.world.player.x, this.world.player.y + PLAYER_SIZE.h * 0.18);
  }

  private mineTile(cell: TileCell): void {
    const minedType = cell.type;
    this.levelNode.clearTile(cell);
    this.laserView.removeCrackOverlay(cell);
    this.playerState.recordMinedTile(minedType);
    this.laserView.playBlockBreakSound(minedType);
  }
}
