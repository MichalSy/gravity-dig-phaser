import Phaser from 'phaser';
import { JOYSTICK_DEADZONE, JOYSTICK_RADIUS } from '../config/gameConfig';
import { isTouchPointer, requestImmersiveLandscape } from '../utils/screen';

export type JoystickSide = 'left' | 'right';

export class VirtualJoystick {
  readonly vector = new Phaser.Math.Vector2(0, 0);
  readonly aim = new Phaser.Math.Vector2(1, 0);

  private readonly scene: Phaser.Scene;
  private readonly side: JoystickSide;
  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;
  private readonly label: Phaser.GameObjects.Text;
  private readonly center = new Phaser.Math.Vector2(0, 0);
  private activePointerId?: number;
  private radius = JOYSTICK_RADIUS;

  constructor(scene: Phaser.Scene, side: JoystickSide, label: string) {
    this.scene = scene;
    this.side = side;
    const color = side === 'left' ? 0x38bdf8 : 0xfb7185;

    this.base = scene.add
      .circle(0, 0, this.radius, 0x0f172a, 0.58)
      .setStrokeStyle(4, color, 0.95)
      .setScrollFactor(0)
      .setDepth(20);
    this.knob = scene.add
      .circle(0, 0, 30, color, 0.88)
      .setStrokeStyle(3, 0xf8fafc, 0.92)
      .setScrollFactor(0)
      .setDepth(21);
    this.label = scene.add
      .text(0, 0, label, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        fontStyle: '700',
        color: '#f8fafc',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(22)
      .setResolution(Math.max(2, window.devicePixelRatio || 1));

    this.layout();
  }

  get active(): boolean {
    return this.activePointerId !== undefined;
  }

  destroy(): void {
    this.base.destroy();
    this.knob.destroy();
    this.label.destroy();
  }

  layout(): void {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    this.radius = Phaser.Math.Clamp(Math.min(width, height) * 0.17, 58, 79);
    const safeMargin = 18;
    const bottomMargin = height <= 430 ? 72 : 88;
    const centerX = this.side === 'left'
      ? this.radius + safeMargin
      : width - this.radius - safeMargin;
    const centerY = height - bottomMargin;

    this.center.set(centerX, centerY);
    this.base.setRadius(this.radius).setPosition(centerX, centerY);
    this.knob.setRadius(this.radius * 0.34).setPosition(centerX, centerY);
    this.label.setPosition(centerX, centerY - this.radius - 16);
  }

  handlePointerDown(pointer: Phaser.Input.Pointer): boolean {
    if (!isTouchPointer(pointer)) return false;
    if (this.activePointerId !== undefined || !this.contains(pointer)) return false;

    requestImmersiveLandscape();
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
    return Phaser.Math.Distance.Between(pointer.x, pointer.y, this.center.x, this.center.y) <= this.radius;
  }

  private update(pointer: Phaser.Input.Pointer): void {
    const dx = pointer.x - this.center.x;
    const dy = pointer.y - this.center.y;
    const length = Math.min(this.radius, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    const knobX = this.center.x + Math.cos(angle) * length;
    const knobY = this.center.y + Math.sin(angle) * length;

    this.knob.setPosition(knobX, knobY);
    this.base.setAlpha(0.82);
    this.vector.set((Math.cos(angle) * length) / this.radius, (Math.sin(angle) * length) / this.radius);

    if (this.vector.length() < JOYSTICK_DEADZONE) {
      this.vector.set(0, 0);
      return;
    }

    if (this.side === 'right') {
      this.aim.copy(this.vector).normalize();
    }
  }
}
