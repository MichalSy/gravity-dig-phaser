import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, JOYSTICK_DEADZONE, JOYSTICK_RADIUS } from '../config/gameConfig';
import { isTouchPointer } from '../utils/screen';

export type JoystickSide = 'left' | 'right';

export class VirtualJoystick {
  readonly vector = new Phaser.Math.Vector2(0, 0);
  readonly aim = new Phaser.Math.Vector2(1, 0);

  private readonly side: JoystickSide;
  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;
  private readonly label: Phaser.GameObjects.Text;
  private readonly center = new Phaser.Math.Vector2(0, 0);
  private activePointerId?: number;

  constructor(scene: Phaser.Scene, side: JoystickSide, label: string) {
    this.side = side;
    this.base = scene.add
      .circle(0, 0, JOYSTICK_RADIUS, 0x0f172a, 0.42)
      .setStrokeStyle(3, side === 'left' ? 0x38bdf8 : 0xfb7185, 0.65)
      .setScrollFactor(0)
      .setDepth(200);
    this.knob = scene.add
      .circle(0, 0, 28, side === 'left' ? 0x38bdf8 : 0xfb7185, 0.62)
      .setStrokeStyle(2, 0xe0f2fe, 0.75)
      .setScrollFactor(0)
      .setDepth(201);
    this.label = scene.add
      .text(0, 0, label, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#e2e8f0',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(202)
      .setAlpha(0.85);

    this.layout();
  }

  get active(): boolean {
    return this.activePointerId !== undefined;
  }

  layout(): void {
    this.center.set(this.side === 'left' ? 128 : GAME_WIDTH - 128, GAME_HEIGHT - 126);
    this.base.setPosition(this.center.x, this.center.y);
    this.knob.setPosition(this.center.x, this.center.y);
    this.label.setPosition(this.center.x, this.center.y + JOYSTICK_RADIUS + 22);
  }

  handlePointerDown(pointer: Phaser.Input.Pointer): boolean {
    if (!isTouchPointer(pointer)) return false;
    const isCorrectSide = this.side === 'left' ? pointer.x < GAME_WIDTH * 0.5 : pointer.x >= GAME_WIDTH * 0.5;
    const isControlZone = pointer.y > GAME_HEIGHT * 0.36;
    if (!isCorrectSide || !isControlZone || this.activePointerId !== undefined) return false;

    this.activePointerId = pointer.id;
    this.update(pointer);
    return true;
  }

  handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.activePointerId) return;
    this.update(pointer);
  }

  handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.activePointerId) return;
    this.activePointerId = undefined;
    this.vector.set(0, 0);
    this.knob.setPosition(this.center.x, this.center.y);
    this.base.setAlpha(1);
  }

  contains(pointer: Phaser.Input.Pointer): boolean {
    const correctSide = this.side === 'left' ? pointer.x < GAME_WIDTH * 0.5 : pointer.x >= GAME_WIDTH * 0.5;
    return isTouchPointer(pointer) && correctSide && pointer.y > GAME_HEIGHT * 0.36;
  }

  private update(pointer: Phaser.Input.Pointer): void {
    const dx = pointer.x - this.center.x;
    const dy = pointer.y - this.center.y;
    const length = Math.min(JOYSTICK_RADIUS, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    const knobX = this.center.x + Math.cos(angle) * length;
    const knobY = this.center.y + Math.sin(angle) * length;

    this.knob.setPosition(knobX, knobY);
    this.base.setAlpha(0.78);
    this.vector.set((Math.cos(angle) * length) / JOYSTICK_RADIUS, (Math.sin(angle) * length) / JOYSTICK_RADIUS);

    if (this.vector.length() < JOYSTICK_DEADZONE) {
      this.vector.set(0, 0);
      return;
    }

    if (this.side === 'right') {
      this.aim.copy(this.vector).normalize();
    }
  }
}
