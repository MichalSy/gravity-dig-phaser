import Phaser from 'phaser';
import { GRAVITY, PLAYER_SIZE } from '../config/gameConfig';
import { GameNode, type NodeContext } from '../nodes';
import type { InputMode } from '../ui/HudState';
import type { UIScene } from '../scenes/UIScene';
import type { GameWorldNode } from './GameplayNodes';
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
  private readonly currentVelocity = new Phaser.Math.Vector2(0, 0);
  private isGrounded = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private jumpHeld = false;
  private gravityActive = true;
  private blocked = false;

  constructor() {
    super({ name: 'playerController', order: 10 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    if (!this.phaserScene.input.keyboard) throw new Error('Keyboard input unavailable');

    this.cursors = this.phaserScene.input.keyboard.createCursorKeys();
    this.keys = this.phaserScene.input.keyboard.addKeys('W,A,S,D,SPACE,R,G,E') as Record<string, Phaser.Input.Keyboard.Key>;
    this.phaserScene.game.events.on('gameplay-menu:opened', this.blockInput, this);
    this.phaserScene.game.events.on('gameplay-menu:closed', this.unblockInput, this);
  }

  resolve(): void {
    this.levelNode = this.requireNode<LevelNode>('level');
    this.world = this.requireNode<GameWorldNode>('world');
    this.playerState = this.requireNode<PlayerStateManagerNode>('playerState');
  }

  destroy(): void {
    this.phaserScene.game.events.off('gameplay-menu:opened', this.blockInput, this);
    this.phaserScene.game.events.off('gameplay-menu:closed', this.unblockInput, this);
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
    this.blocked = true;
    this.currentVelocity.x = 0;
    this.jumpHeld = false;
    this.jumpBufferTimer = 0;
  }

  unblockInput(): void {
    this.blocked = false;
  }

  resetMotion(): void {
    this.currentVelocity.set(0, 0);
    this.isGrounded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.jumpHeld = false;
  }

  get velocity(): Phaser.Math.Vector2 {
    return this.currentVelocity;
  }

  get grounded(): boolean {
    return this.isGrounded;
  }

  get gravityEnabled(): boolean {
    return this.gravityActive;
  }

  get inputBlocked(): boolean {
    return this.blocked;
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
    if (this.blocked) {
      this.currentVelocity.x = 0;
      this.jumpHeld = false;
      this.jumpBufferTimer = 0;
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

    this.currentVelocity.x = 0;
    if (left) this.currentVelocity.x -= this.playerState.stats.moveSpeed * this.inputStrength(mode, joy.x, gamepadX, -1);
    if (right) this.currentVelocity.x += this.playerState.stats.moveSpeed * this.inputStrength(mode, joy.x, gamepadX, 1);

    if (desktop && Phaser.Input.Keyboard.JustDown(this.keys.G)) {
      this.gravityActive = !this.gravityActive;
      this.currentVelocity.y = 0;
    }

    if (desktop && Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.world.createLevel(`gravity-dig-phaser-${Date.now()}`, false);
      return;
    }

    if (desktop && Phaser.Input.Keyboard.JustDown(this.keys.E)) {
      this.phaserScene.game.events.emit('ship:return-cargo');
    }

    if (up && !this.gravityActive) this.currentVelocity.y = -this.playerState.stats.moveSpeed;
    if (down && !this.gravityActive) this.currentVelocity.y = this.playerState.stats.moveSpeed;
    if (!up && !down && !this.gravityActive) this.currentVelocity.y = 0;

    const keyboardJump = desktop && (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) || Phaser.Input.Keyboard.JustDown(this.keys.W));
    const touchJump = joyUp && !this.jumpHeld;
    const gamepadJump = gamepadMode && this.button(gamepad, 0) && !this.jumpHeld;
    this.jumpHeld = joyUp || (gamepadMode && this.button(gamepad, 0));

    if (keyboardJump || touchJump || gamepadJump) {
      if (this.isGrounded || this.coyoteTimer > 0) {
        this.jump();
      } else {
        this.jumpBufferTimer = 0.1;
      }
    }

    if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= deltaSeconds;
  }

  private applyPhysics(deltaSeconds: number): void {
    if (!this.player) return;

    const wasGrounded = this.isGrounded;
    if (this.gravityActive) this.currentVelocity.y += GRAVITY * deltaSeconds;

    this.moveAxis(this.currentVelocity.x * deltaSeconds, 0);
    this.isGrounded = false;
    this.moveAxis(0, this.currentVelocity.y * deltaSeconds);

    if (wasGrounded && !this.isGrounded) this.coyoteTimer = 0.1;
    if (this.coyoteTimer > 0) this.coyoteTimer -= deltaSeconds;

    if (this.jumpBufferTimer > 0 && (this.isGrounded || this.coyoteTimer > 0)) {
      this.jump();
      this.jumpBufferTimer = 0;
    }
  }

  private jump(): void {
    this.currentVelocity.y = this.playerState.stats.jumpVelocity;
    this.isGrounded = false;
    this.coyoteTimer = 0;
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

      if (dy > 0) this.isGrounded = true;
      if (dy !== 0) this.currentVelocity.y = 0;
      if (dx !== 0) this.currentVelocity.x = 0;
      break;
    }
  }

  private inputStrength(mode: InputMode, touchAxis: number, gamepadAxis: number, direction: -1 | 1): number {
    if (mode === 'touch') return Math.max(0.45, Math.abs(touchAxis));
    if (mode === 'gamepad') return Math.max(0.45, Math.abs(gamepadAxis));
    return direction ? 1 : 0;
  }

  private get uiScene(): UIScene {
    return this.phaserScene.scene.get('ui') as UIScene;
  }
}
