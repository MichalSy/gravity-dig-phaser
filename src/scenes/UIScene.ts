import Phaser from 'phaser';
import { VirtualJoystick } from '../controls/VirtualJoystick';

export interface HudState {
  title: string;
  planet: string;
  stats: string;
  inventory: string;
  debug: string;
  target: string;
}

export class UIScene extends Phaser.Scene {
  private leftJoystick!: VirtualJoystick;
  private rightJoystick!: VirtualJoystick;
  private hudText!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;
  private controlsHint!: Phaser.GameObjects.Text;

  constructor() {
    super('ui');
  }

  create(): void {
    this.input.addPointer(3);
    this.createHud();
    this.leftJoystick = new VirtualJoystick(this, 'left', 'MOVE');
    this.rightJoystick = new VirtualJoystick(this, 'right', 'LASER');
    this.layout();

    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUp, this);
    this.scale.on('resize', this.layout, this);
    this.game.events.on('hud:update', this.updateHud, this);
  }

  getMoveVector(): Phaser.Math.Vector2 {
    return this.leftJoystick?.vector ?? Phaser.Math.Vector2.ZERO;
  }

  getAimVector(): Phaser.Math.Vector2 {
    return this.rightJoystick?.aim ?? Phaser.Math.Vector2.RIGHT;
  }

  isAiming(): boolean {
    return this.rightJoystick?.active ?? false;
  }

  containsControlPointer(pointer: Phaser.Input.Pointer): boolean {
    return this.leftJoystick.contains(pointer) || this.rightJoystick.contains(pointer);
  }

  private createHud(): void {
    const resolution = Math.max(2, window.devicePixelRatio || 1);
    this.hudText = this.add
      .text(14, 12, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        color: '#e2e8f0',
        backgroundColor: 'rgba(2,6,23,0.68)',
        padding: { x: 12, y: 10 },
        lineSpacing: 2,
      })
      .setScrollFactor(0)
      .setDepth(10)
      .setResolution(resolution);

    this.debugText = this.add
      .text(14, 0, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        color: '#bfdbfe',
        backgroundColor: 'rgba(2,6,23,0.58)',
        padding: { x: 10, y: 8 },
        lineSpacing: 2,
      })
      .setScrollFactor(0)
      .setDepth(10)
      .setResolution(resolution);

    this.controlsHint = this.add
      .text(0, 0, 'Mobile: linker Stick laufen/springen · rechter Stick zielen & minen', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        color: '#e2e8f0',
        backgroundColor: 'rgba(2,6,23,0.45)',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(10)
      .setResolution(resolution);
  }

  private layout(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const compact = height <= 430 || width <= 760;

    this.leftJoystick?.layout();
    this.rightJoystick?.layout();
    this.hudText?.setPosition(14, 12);
    this.hudText?.setWordWrapWidth(compact ? Math.max(260, width - 220) : Math.max(320, width - 28));
    this.debugText?.setPosition(14, Math.max(140, height - 76)).setVisible(!compact);
    this.debugText?.setWordWrapWidth(Math.max(320, width - 28));
    this.controlsHint?.setPosition(width / 2, Math.max(24, height - 26)).setVisible(!compact);
    this.controlsHint?.setWordWrapWidth(Math.max(320, width - 48));
  }

  private updateHud(state: HudState): void {
    this.hudText.setText([
      state.title,
      state.planet,
      state.stats,
      state.inventory,
    ]);
    this.debugText.setText([
      state.debug,
      state.target,
    ]);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const handledLeft = this.leftJoystick.handlePointerDown(pointer);
    const handledRight = this.rightJoystick.handlePointerDown(pointer);
    if (handledLeft || handledRight) pointer.event.preventDefault();
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    this.leftJoystick.handlePointerMove(pointer);
    this.rightJoystick.handlePointerMove(pointer);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    this.leftJoystick.handlePointerUp(pointer);
    this.rightJoystick.handlePointerUp(pointer);
  }
}
