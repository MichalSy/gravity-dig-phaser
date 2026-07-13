import * as Core from '@gravity-dig/game-core';

type InputMode = 'desktop' | 'touch' | 'gamepad';
type Point = { x: number; y: number };
type InputDeviceLike = {
  isKeyDown(key: string): boolean;
  isKeyJustDown(key: string): boolean;
  getPointer(): { isDown: boolean; world: Point };
  getGamepadAxis(index: number): number;
  isGamepadButtonDown(index: number): boolean;
};

export default class GameplayInputScript extends Core.ScriptNode {
  id = 'dynamic.gameplay-input';
  name = 'Gameplay Input';
  deviceNodeId = Core.prop.nodeRef('87b03f69-911d-55e3-a00f-d2f92f460f4e', { label: 'Input Device' });

  private device!: InputDeviceLike;
  private inputMode: InputMode = 'desktop';
  private moveVector: Point = { x: 0, y: 0 };
  private aimVector: Point = { x: 1, y: 0 };
  private gamepadAim: Point = { x: 1, y: 0 };
  private aiming = false;
  private menuOpen = false;
  private controlPointerResolver: (pointer: unknown) => boolean = () => false;

  resolve() {
    const device = this.deviceNodeId ? this.getNodeById<InputDeviceLike>(this.deviceNodeId) : undefined;
    if (!device) throw new Error("Required node 'InputDevice' was not resolved");
    this.device = device;
  }

  setInputMode(mode: InputMode) { this.inputMode = mode; }
  getInputMode() { return this.inputMode; }
  setMoveVector(vector: Point) { this.moveVector = { x: vector.x, y: vector.y }; }
  getMoveVector() { return this.moveVector; }
  setAimVector(vector: Point) { this.aimVector = normalized(vector, this.aimVector); }
  getAimVector() { return this.aimVector; }
  setAiming(aiming: boolean) { this.aiming = aiming; }
  isAiming() { return !this.menuOpen && this.inputMode === 'touch' && this.aiming; }
  setMenuOpen(open: boolean) { this.menuOpen = open; }
  isMenuOpen() { return this.menuOpen; }
  setControlPointerResolver(resolver: (pointer: unknown) => boolean) { this.controlPointerResolver = resolver; }
  containsControlPointer(pointer: unknown) { return this.inputMode === 'touch' && this.controlPointerResolver(pointer); }

  getPlayerIntent(options: { previousJumpHeld: boolean }) {
    const desktop = this.inputMode === 'desktop';
    const touch = this.inputMode === 'touch';
    const gamepad = this.inputMode === 'gamepad';
    const gamepadX = gamepad ? this.device.getGamepadAxis(0) : 0;
    const gamepadY = gamepad ? this.device.getGamepadAxis(1) : 0;
    const left = (desktop && (this.device.isKeyDown('LEFT') || this.device.isKeyDown('A'))) || (touch && this.moveVector.x < -0.22) || (gamepad && gamepadX < -0.22);
    const right = (desktop && (this.device.isKeyDown('RIGHT') || this.device.isKeyDown('D'))) || (touch && this.moveVector.x > 0.22) || (gamepad && gamepadX > 0.22);
    const touchJumpHeld = touch && this.moveVector.y < -0.56;
    const gamepadJumpHeld = gamepad && this.device.isGamepadButtonDown(0);
    const keyboardJumpHeld = desktop && (this.device.isKeyDown('UP') || this.device.isKeyDown('W') || this.device.isKeyDown('SPACE'));
    const moveStrength = touch
      ? Math.max(0.45, Math.abs(this.moveVector.x))
      : gamepad ? Math.max(0.45, Math.abs(gamepadX)) : 1;
    return {
      moveX: this.menuOpen ? 0 : ((left ? -1 : 0) + (right ? 1 : 0)) * moveStrength,
      jumpPressed: !this.menuOpen && ((desktop && (this.device.isKeyJustDown('SPACE') || this.device.isKeyJustDown('W'))) || ((touchJumpHeld || gamepadJumpHeld) && !options.previousJumpHeld)),
      jumpHeld: !this.menuOpen && (touchJumpHeld || keyboardJumpHeld || gamepadJumpHeld || (gamepad && gamepadY < -0.56)),
      interactPressed: !this.menuOpen && desktop && this.device.isKeyJustDown('E'),
    };
  }

  getMiningIntent(options: { playerX: number; playerY: number; inputBlocked: boolean; miningRange: number; gamepadAim: Point; laserOrigin: Point }) {
    const blocked = options.inputBlocked || this.menuOpen;
    if (blocked) return { aiming: false, miningPressed: false };
    const origin = { x: options.playerX, y: options.playerY };
    if (this.inputMode === 'touch') {
      const active = this.isAiming();
      return { aiming: active, miningPressed: active, aimWorld: active ? pointAtRange(origin, this.aimVector, options.miningRange) : undefined };
    }
    if (this.inputMode === 'gamepad') {
      const stick = { x: this.device.getGamepadAxis(2), y: this.device.getGamepadAxis(3) };
      if (Math.hypot(stick.x, stick.y) > 0.22) this.gamepadAim = normalized(stick, this.gamepadAim);
      options.gamepadAim.x = this.gamepadAim.x;
      options.gamepadAim.y = this.gamepadAim.y;
      return {
        aiming: true,
        miningPressed: this.device.isGamepadButtonDown(7) || this.device.isGamepadButtonDown(5),
        aimWorld: pointAtRange(origin, this.gamepadAim, options.miningRange),
      };
    }
    const pointer = this.device.getPointer();
    return { aiming: true, miningPressed: pointer.isDown, aimWorld: pointer.world };
  }
}

function normalized(value: Point, fallback: Point): Point {
  const length = Math.hypot(value.x, value.y);
  return length > 0.0001 ? { x: value.x / length, y: value.y / length } : { ...fallback };
}

function pointAtRange(origin: Point, direction: Point, range: number): Point {
  return { x: origin.x + direction.x * range, y: origin.y + direction.y * range };
}
