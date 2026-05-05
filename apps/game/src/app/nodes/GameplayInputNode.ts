import Phaser from 'phaser';
import { buildMiningInputIntent, buildPlayerInputIntent, getGamepad, type MiningInputIntent, type PlayerInputIntent } from '../../input/gameplayIntents';
import { GameNode, type NodeContext } from '../../nodes';
import type { InputMode } from '../../ui/HudState';

const ZERO = new Phaser.Math.Vector2(0, 0);
const RIGHT = new Phaser.Math.Vector2(1, 0);

type CursorKeys = Phaser.Types.Input.Keyboard.CursorKeys;

export interface PlayerIntentOptions {
  previousJumpHeld: boolean;
}

export interface MiningIntentOptions {
  playerX: number;
  playerY: number;
  inputBlocked: boolean;
  miningRange: number;
  gamepadAim: Phaser.Math.Vector2;
  laserOrigin: Phaser.Math.Vector2;
}

export class GameplayInputNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private cursors!: CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private inputMode: InputMode = 'desktop';
  private readonly moveVector = ZERO.clone();
  private readonly aimVector = RIGHT.clone();
  private aiming = false;
  private menuOpen = false;
  private controlPointerResolver: (pointer: Phaser.Input.Pointer) => boolean = () => false;

  constructor() {
    super({ name: 'gameplayInput', order: 0 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    if (!this.phaserScene.input.keyboard) throw new Error('Keyboard input unavailable');

    this.cursors = this.phaserScene.input.keyboard.createCursorKeys();
    this.keys = this.phaserScene.input.keyboard.addKeys('W,A,S,D,SPACE,E') as Record<string, Phaser.Input.Keyboard.Key>;
  }

  setInputMode(inputMode: InputMode): void {
    this.inputMode = inputMode;
  }

  getInputMode(): InputMode {
    return this.inputMode;
  }

  setMoveVector(vector: Phaser.Math.Vector2): void {
    this.moveVector.copy(vector);
  }

  getMoveVector(): Phaser.Math.Vector2 {
    return this.moveVector;
  }

  setAimVector(vector: Phaser.Math.Vector2): void {
    this.aimVector.copy(vector);
  }

  getAimVector(): Phaser.Math.Vector2 {
    return this.aimVector;
  }

  setAiming(aiming: boolean): void {
    this.aiming = aiming;
  }

  isAiming(): boolean {
    return !this.menuOpen && this.inputMode === 'touch' && this.aiming;
  }

  setMenuOpen(menuOpen: boolean): void {
    this.menuOpen = menuOpen;
  }

  isMenuOpen(): boolean {
    return this.menuOpen;
  }

  setControlPointerResolver(resolver: (pointer: Phaser.Input.Pointer) => boolean): void {
    this.controlPointerResolver = resolver;
  }

  containsControlPointer(pointer: Phaser.Input.Pointer): boolean {
    return this.inputMode === 'touch' && this.controlPointerResolver(pointer);
  }

  getPlayerIntent(options: PlayerIntentOptions): PlayerInputIntent {
    return buildPlayerInputIntent({
      mode: this.inputMode,
      moveVector: this.moveVector,
      cursors: this.cursors,
      keys: this.keys,
      gamepad: this.inputMode === 'gamepad' ? getGamepad() : undefined,
      previousJumpHeld: options.previousJumpHeld,
      activePointer: this.phaserScene.input.activePointer,
      camera: this.phaserScene.cameras.main,
      aimVector: this.aimVector,
      touchAiming: this.isAiming(),
      inputBlocked: this.menuOpen,
    });
  }

  getMiningIntent(options: MiningIntentOptions): MiningInputIntent {
    options.laserOrigin.set(options.playerX, options.playerY);
    return buildMiningInputIntent({
      mode: this.inputMode,
      moveVector: this.moveVector,
      cursors: this.cursors,
      keys: this.keys,
      gamepad: this.inputMode === 'gamepad' ? getGamepad() : undefined,
      activePointer: this.phaserScene.input.activePointer,
      camera: this.phaserScene.cameras.main,
      aimVector: this.aimVector,
      touchAiming: this.isAiming(),
      inputBlocked: options.inputBlocked || this.menuOpen,
      miningRange: options.miningRange,
      laserOrigin: options.laserOrigin,
      gamepadAim: options.gamepadAim,
    });
  }
}
