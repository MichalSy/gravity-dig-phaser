import Phaser from 'phaser';
import { GRAVITY, PLAYER_SIZE } from '../config/gameConfig';
import { GameNode, type NodeContext } from '../nodes';
import type { GameplayUiScene } from '../ui/GameplayUiScene';
import type { GameWorldNode } from './nodes/GameWorldNode';
import { inputStrength } from './gameplayLogic';
import { emitGameEvent, GAME_EVENTS, offGameEvent, onGameEvent } from './gameEvents';
import { createPlayerControllerData, type PlayerControllerData } from './nodeData';
import { LevelNode } from './LevelNodes';
import { PlayerStateManagerNode } from './PlayerStateManagerNode';

type CursorKeys = Phaser.Types.Input.Keyboard.CursorKeys;

export class PlayerControllerNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private levelNode!: LevelNode;
  private world!: GameWorldNode;
  private playerState!: PlayerStateManagerNode;
  private player?: Phaser.GameObjects.Image;
  private cursors!: CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  override readonly dependencies = ['level', 'world', 'playerState', 'ui.gameplay'] as const;
  readonly data: PlayerControllerData = createPlayerControllerData();

  constructor() {
    super({ name: 'playerController', order: 10 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    if (!this.phaserScene.input.keyboard) throw new Error('Keyboard input unavailable');

    this.cursors = this.phaserScene.input.keyboard.createCursorKeys();
    this.keys = this.phaserScene.input.keyboard.addKeys('W,A,S,D,SPACE,R,G,E') as Record<string, Phaser.Input.Keyboard.Key>;
    onGameEvent(this.phaserScene, GAME_EVENTS.gameplayMenuOpened, this.blockInput, this);
    onGameEvent(this.phaserScene, GAME_EVENTS.gameplayMenuClosed, this.unblockInput, this);
  }

  resolve(): void {
    this.levelNode = this.requireNode<LevelNode>('level');
    this.world = this.requireNode<GameWorldNode>('world');
    this.playerState = this.requireNode<PlayerStateManagerNode>('playerState');
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

  get gravityEnabled(): boolean {
    return this.data.gravityEnabled;
  }

  get inputBlocked(): boolean {
    return this.data.inputBlocked;
  }

  getGamepad(): Gamepad | undefined {
    return navigator.getGamepads?.().find((pad): pad is Gamepad => Boolean(pad)) ?? undefined;
  }

  axis(gamepad: Gamepad | undefined, index: number): number {
    const value = gamepad?.axes[index] ?? 0;
    return Math.abs(value) < 0.18 ? 0 : value;
  }

  button(gamepad: Gamepad | undefined, index: number): boolean {
    const button = gamepad?.buttons[index];
    return Boolean(button?.pressed || (button?.value ?? 0) > 0.35);
  }

  private handleInput(deltaSeconds: number): void {
    if (this.data.inputBlocked) {
      this.data.velocity.x = 0;
      this.data.jumpHeld = false;
      this.data.jumpBufferTimerSeconds = 0;
      return;
    }

    const uiScene = this.uiScene;
    const mode = uiScene.getInputMode();
    const joy = uiScene.getMoveVector();
    const gamepad = mode === 'gamepad' ? this.getGamepad() : undefined;
    const gamepadX = gamepad ? this.axis(gamepad, 0) : 0;
    const gamepadY = gamepad ? this.axis(gamepad, 1) : 0;
    const desktop = mode === 'desktop';
    const touch = mode === 'touch';
    const gamepadMode = mode === 'gamepad';

    const left = (desktop && (this.cursors.left?.isDown || this.keys.A.isDown)) || (touch && joy.x < -0.22) || (gamepadMode && gamepadX < -0.22);
    const right = (desktop && (this.cursors.right?.isDown || this.keys.D.isDown)) || (touch && joy.x > 0.22) || (gamepadMode && gamepadX > 0.22);
    const joyUp = touch && joy.y < -0.56;
    const joyDown = touch && joy.y > 0.56;
    const gamepadUp = gamepadMode && (gamepadY < -0.56 || this.button(gamepad, 0));
    const gamepadDown = gamepadMode && gamepadY > 0.56;
    const up = (desktop && (this.cursors.up?.isDown || this.keys.W.isDown || this.keys.SPACE.isDown)) || joyUp || gamepadUp;
    const down = (desktop && (this.cursors.down?.isDown || this.keys.S.isDown)) || joyDown || gamepadDown;

    this.data.velocity.x = 0;
    if (left) this.data.velocity.x -= this.playerState.stats.moveSpeed * inputStrength(mode, joy.x, gamepadX);
    if (right) this.data.velocity.x += this.playerState.stats.moveSpeed * inputStrength(mode, joy.x, gamepadX);

    if (desktop && Phaser.Input.Keyboard.JustDown(this.keys.G)) {
      this.data.gravityEnabled = !this.data.gravityEnabled;
      this.data.velocity.y = 0;
    }

    if (desktop && Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.world.createLevel(`gravity-dig-phaser-${Date.now()}`, false);
      return;
    }

    if (desktop && Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      emitGameEvent(this.phaserScene, GAME_EVENTS.shipReturnCargo);
    }

    if (up && !this.data.gravityEnabled) this.data.velocity.y = -this.playerState.stats.moveSpeed;
    if (down && !this.data.gravityEnabled) this.data.velocity.y = this.playerState.stats.moveSpeed;
    if (!up && !down && !this.data.gravityEnabled) this.data.velocity.y = 0;

    const keyboardJump = desktop && (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.W));
    const touchJump = joyUp && !this.data.jumpHeld;
    const gamepadJump = gamepadMode && this.button(gamepad, 0) && !this.data.jumpHeld;
    this.data.jumpHeld = joyUp || (gamepadMode && this.button(gamepad, 0));

    if (keyboardJump || touchJump || gamepadJump) {
      if (this.data.grounded || this.data.coyoteTimerSeconds > 0) {
        this.jump();
      } else {
        this.data.jumpBufferTimerSeconds = 0.1;
      }
    }

    if (this.data.jumpBufferTimerSeconds > 0) this.data.jumpBufferTimerSeconds -= deltaSeconds;
  }

  private applyPhysics(deltaSeconds: number): void {
    if (!this.player) return;

    const wasGrounded = this.data.grounded;
    if (this.data.gravityEnabled) this.data.velocity.y += GRAVITY * deltaSeconds;

    this.moveAxis(this.data.velocity.x * deltaSeconds, 0);
    this.data.grounded = false;
    this.moveAxis(0, this.data.velocity.y * deltaSeconds);

    if (wasGrounded && !this.data.grounded) this.data.coyoteTimerSeconds = 0.1;
    if (this.data.coyoteTimerSeconds > 0) this.data.coyoteTimerSeconds -= deltaSeconds;

    if (this.data.jumpBufferTimerSeconds > 0 && (this.data.grounded || this.data.coyoteTimerSeconds > 0)) {
      this.jump();
      this.data.jumpBufferTimerSeconds = 0;
    }
  }

  private jump(): void {
    this.data.velocity.y = this.playerState.stats.jumpVelocity;
    this.data.grounded = false;
    this.data.coyoteTimerSeconds = 0;
    this.phaserScene.sound.play('jump', { volume: 0.42, detune: Phaser.Math.Between(-40, 40) });
  }

  private moveAxis(dx: number, dy: number): void {
    if (!this.player || (dx === 0 && dy === 0)) return;

    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8);
    const stepX = dx / steps;
    const stepY = dy / steps;

    for (let i = 0; i < steps; i += 1) {
      const nextX = this.player.x + stepX;
      const nextY = this.player.y + stepY;
      if (!this.levelNode.collidesBox(nextX, nextY, PLAYER_SIZE.w, PLAYER_SIZE.h)) {
        this.player.setPosition(nextX, nextY);
        continue;
      }

      if (dy > 0) this.data.grounded = true;
      if (dy !== 0) this.data.velocity.y = 0;
      if (dx !== 0) this.data.velocity.x = 0;
      break;
    }
  }


  private get uiScene(): GameplayUiScene {
    return this.requireNode<GameplayUiScene>('ui.gameplay');
  }
}
