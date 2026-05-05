import Phaser from 'phaser';
import type { InputMode } from '../ui/HudState';

export interface PlayerInputIntent {
  moveX: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
  interactPressed: boolean;
}

export interface MiningInputIntent {
  aiming: boolean;
  miningPressed: boolean;
  aimWorld?: Phaser.Math.Vector2;
}

interface SharedInputSource {
  mode: InputMode;
  moveVector: Phaser.Math.Vector2;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  keys: Record<string, Phaser.Input.Keyboard.Key>;
  gamepad?: Gamepad;
  activePointer: Phaser.Input.Pointer;
  camera: Phaser.Cameras.Scene2D.Camera;
  aimVector: Phaser.Math.Vector2;
  touchAiming: boolean;
  inputBlocked: boolean;
}

export interface PlayerInputIntentSource extends SharedInputSource {
  previousJumpHeld: boolean;
}

export interface MiningInputIntentSource extends SharedInputSource {
  miningRange: number;
  laserOrigin: Phaser.Math.Vector2;
  gamepadAim: Phaser.Math.Vector2;
}

export function buildPlayerInputIntent(source: PlayerInputIntentSource): PlayerInputIntent {
  const desktop = source.mode === 'desktop';
  const touch = source.mode === 'touch';
  const gamepadMode = source.mode === 'gamepad';
  const gamepadX = gamepadMode ? axis(source.gamepad, 0) : 0;
  const gamepadY = gamepadMode ? axis(source.gamepad, 1) : 0;

  const left = (desktop && (source.cursors.left?.isDown || source.keys.A.isDown)) || (touch && source.moveVector.x < -0.22) || (gamepadMode && gamepadX < -0.22);
  const right = (desktop && (source.cursors.right?.isDown || source.keys.D.isDown)) || (touch && source.moveVector.x > 0.22) || (gamepadMode && gamepadX > 0.22);
  const joyUp = touch && source.moveVector.y < -0.56;
  const gamepadJumpHeld = gamepadMode && button(source.gamepad, 0);
  const up = desktop && (source.cursors.up?.isDown || source.keys.W.isDown || source.keys.SPACE.isDown);
  const keyboardJump = desktop && (Phaser.Input.Keyboard.JustDown(source.keys.SPACE) || Phaser.Input.Keyboard.JustDown(source.keys.W));
  const touchJump = joyUp && !source.previousJumpHeld;
  const gamepadJump = gamepadJumpHeld && !source.previousJumpHeld;

  const moveStrength = source.mode === 'touch'
    ? Math.max(0.45, Math.abs(source.moveVector.x))
    : source.mode === 'gamepad'
      ? Math.max(0.45, Math.abs(gamepadX))
      : 1;

  return {
    moveX: ((left ? -1 : 0) + (right ? 1 : 0)) * moveStrength,
    jumpPressed: keyboardJump || touchJump || gamepadJump,
    jumpHeld: joyUp || up || gamepadJumpHeld || (gamepadMode && gamepadY < -0.56),
    interactPressed: desktop && Phaser.Input.Keyboard.JustDown(source.keys.E),
  };
}

export function buildMiningInputIntent(source: MiningInputIntentSource): MiningInputIntent {
  if (source.inputBlocked) return { aiming: false, miningPressed: false };

  if (source.mode === 'touch') {
    return {
      aiming: source.touchAiming,
      miningPressed: source.touchAiming,
      aimWorld: source.touchAiming ? worldPointFromAimVector(source.laserOrigin, source.aimVector, source.miningRange) : undefined,
    };
  }

  if (source.mode === 'gamepad') {
    const aimX = axis(source.gamepad, 2);
    const aimY = axis(source.gamepad, 3);
    if (Math.hypot(aimX, aimY) > 0.22) source.gamepadAim.set(aimX, aimY).normalize();
    return {
      aiming: true,
      miningPressed: button(source.gamepad, 7) || button(source.gamepad, 5),
      aimWorld: worldPointFromAimVector(source.laserOrigin, source.gamepadAim, source.miningRange),
    };
  }

  return {
    aiming: true,
    miningPressed: source.activePointer.isDown,
    aimWorld: source.activePointer.positionToCamera(source.camera) as Phaser.Math.Vector2,
  };
}

export function getGamepad(): Gamepad | undefined {
  return navigator.getGamepads?.().find((pad): pad is Gamepad => Boolean(pad)) ?? undefined;
}

export function axis(gamepad: Gamepad | undefined, index: number): number {
  const value = gamepad?.axes[index] ?? 0;
  return Math.abs(value) < 0.18 ? 0 : value;
}

export function button(gamepad: Gamepad | undefined, index: number): boolean {
  const gamepadButton = gamepad?.buttons[index];
  return Boolean(gamepadButton?.pressed || (gamepadButton?.value ?? 0) > 0.35);
}

function worldPointFromAimVector(origin: Phaser.Math.Vector2, aim: Phaser.Math.Vector2, range: number): Phaser.Math.Vector2 {
  return new Phaser.Math.Vector2(origin.x + aim.x * range, origin.y + aim.y * range);
}
