import Phaser from 'phaser';
import { NODE_TYPE_IDS, GameNode, type GameNodeOptions, type NodeContext } from '../../nodes';

export interface InputPoint {
  x: number;
  y: number;
}

export interface PointerSnapshot {
  isDown: boolean;
  world: InputPoint;
}

export class InputDeviceNode extends GameNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.InputDeviceNode;

  private phaserScene!: Phaser.Scene;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(options: GameNodeOptions = {}) {
    super({ name: 'InputDevice', className: 'InputDeviceNode', ...options });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    if (!this.phaserScene.input.keyboard) throw new Error('Keyboard input unavailable');
    this.keys = this.phaserScene.input.keyboard.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,SPACE,E') as Record<string, Phaser.Input.Keyboard.Key>;
  }

  isKeyDown(key: string): boolean {
    return this.keys[key.toUpperCase()]?.isDown === true;
  }

  isKeyJustDown(key: string): boolean {
    const input = this.keys[key.toUpperCase()];
    return Boolean(input && Phaser.Input.Keyboard.JustDown(input));
  }

  getPointer(): PointerSnapshot {
    const pointer = this.phaserScene.input.activePointer;
    const world = pointer.positionToCamera(this.phaserScene.cameras.main) as Phaser.Math.Vector2;
    return { isDown: pointer.isDown, world: { x: world.x, y: world.y } };
  }

  getGamepadAxis(index: number): number {
    const value = currentGamepad()?.axes[index] ?? 0;
    return Math.abs(value) < 0.18 ? 0 : value;
  }

  isGamepadButtonDown(index: number): boolean {
    const button = currentGamepad()?.buttons[index];
    return Boolean(button?.pressed || (button?.value ?? 0) > 0.35);
  }
}

function currentGamepad(): Gamepad | undefined {
  return navigator.getGamepads?.().find((gamepad): gamepad is Gamepad => Boolean(gamepad)) ?? undefined;
}
