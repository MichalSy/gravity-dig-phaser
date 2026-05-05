import Phaser from 'phaser';
import { GameplayInputNode } from '../../app/nodes';
import { GameNode, type NodeContext } from '../../nodes';
import { emitGameEvent, GAME_EVENTS, offGameEvent, onGameEvent } from '../gameEvents';
import { createPlayerControllerData, type PlayerControllerData } from '../nodeData';
import { stepPlayerPhysics } from '../physics/playerMovement';
import { LevelNode } from './LevelNode';
import { PlayerStateManagerNode } from './PlayerStateManagerNode';

export class PlayerControllerNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private levelNode!: LevelNode;
  private playerState!: PlayerStateManagerNode;
  private gameplayInput!: GameplayInputNode;
  private player?: Phaser.GameObjects.Image;
  override readonly dependencies = ['level', 'playerState', 'gameplayInput'] as const;
  readonly data: PlayerControllerData = createPlayerControllerData();

  constructor() {
    super({ name: 'playerController', order: 10, className: 'PlayerControllerNode' });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    onGameEvent(this.phaserScene, GAME_EVENTS.gameplayMenuOpened, this.blockInput, this);
    onGameEvent(this.phaserScene, GAME_EVENTS.gameplayMenuClosed, this.unblockInput, this);
  }

  resolve(): void {
    this.levelNode = this.requireNode<LevelNode>('level');
    this.playerState = this.requireNode<PlayerStateManagerNode>('playerState');
    this.gameplayInput = this.requireNode<GameplayInputNode>('gameplayInput');
  }

  destroy(): void {
    offGameEvent(this.phaserScene, GAME_EVENTS.gameplayMenuOpened, this.blockInput, this);
    offGameEvent(this.phaserScene, GAME_EVENTS.gameplayMenuClosed, this.unblockInput, this);
  }

  setPlayer(player: Phaser.GameObjects.Image): void {
    this.player = player;
    this.resetMotion();
  }

  update(deltaMs: number): void {
    if (!this.player) return;

    const deltaSeconds = deltaMs / 1000;
    this.handleInput(deltaSeconds);
    this.applyPhysics(deltaSeconds);
  }

  blockInput(): void {
    this.data.inputBlocked = true;
    this.data.velocity.x = 0;
    this.data.jumpHeld = false;
    this.data.jumpBufferTimerSeconds = 0;
  }

  unblockInput(): void {
    this.data.inputBlocked = false;
  }

  resetMotion(): void {
    this.data.velocity.set(0, 0);
    this.data.grounded = false;
    this.data.coyoteTimerSeconds = 0;
    this.data.jumpBufferTimerSeconds = 0;
    this.data.jumpHeld = false;
  }

  get velocity(): Phaser.Math.Vector2 {
    return this.data.velocity;
  }

  get grounded(): boolean {
    return this.data.grounded;
  }

  get inputBlocked(): boolean {
    return this.data.inputBlocked;
  }

  private handleInput(deltaSeconds: number): void {
    if (this.data.inputBlocked) {
      this.data.velocity.x = 0;
      this.data.jumpHeld = false;
      this.data.jumpBufferTimerSeconds = 0;
      return;
    }

    const intent = this.gameplayInput.getPlayerIntent({ previousJumpHeld: this.data.jumpHeld });
    this.data.velocity.x = intent.moveX * this.playerState.stats.moveSpeed;

    if (intent.interactPressed) emitGameEvent(this.phaserScene, GAME_EVENTS.playerInteractRequested);

    this.data.jumpHeld = intent.jumpHeld;
    if (intent.jumpPressed) this.queueOrPerformJump();
    if (this.data.jumpBufferTimerSeconds > 0) this.data.jumpBufferTimerSeconds -= deltaSeconds;
  }

  private queueOrPerformJump(): void {
    if (this.data.grounded || this.data.coyoteTimerSeconds > 0) {
      this.jump();
      return;
    }

    this.data.jumpBufferTimerSeconds = 0.1;
  }

  private applyPhysics(deltaSeconds: number): void {
    if (!this.player) return;

    stepPlayerPhysics({
      player: this.player,
      data: this.data,
      deltaSeconds,
      collidesBox: (x, y, width, height) => this.levelNode.collidesBox(x, y, width, height),
      jump: () => this.jump(),
    });
  }

  private jump(): void {
    this.data.velocity.y = this.playerState.stats.jumpVelocity;
    this.data.grounded = false;
    this.data.coyoteTimerSeconds = 0;
    this.phaserScene.sound.play('jump', { volume: 0.42, detune: Phaser.Math.Between(-40, 40) });
  }
}
