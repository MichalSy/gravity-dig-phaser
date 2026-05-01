import Phaser from 'phaser';
import { VirtualJoystick } from '../controls/VirtualJoystick';

export type InputMode = 'touch' | 'desktop' | 'gamepad';

export interface HudState {
  title: string;
  planet: string;
  stats: string;
  inventory: string;
  debug: string;
  target: string;
  inputMode: InputMode;
}

export class UIScene extends Phaser.Scene {
  private leftJoystick!: VirtualJoystick;
  private rightJoystick!: VirtualJoystick;
  private hudText!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;
  private controlsHint!: Phaser.GameObjects.Text;
  private inputMode: InputMode = 'desktop';

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
    this.updateInputMode();
  }

  update(): void {
    this.updateInputMode();
  }

  getInputMode(): InputMode {
    return this.inputMode;
  }

  getMoveVector(): Phaser.Math.Vector2 {
    return this.inputMode === 'touch' ? this.leftJoystick.vector : Phaser.Math.Vector2.ZERO;
  }

  getAimVector(): Phaser.Math.Vector2 {
    return this.inputMode === 'touch' ? this.rightJoystick.aim : Phaser.Math.Vector2.RIGHT;
  }

  isAiming(): boolean {
    return this.inputMode === 'touch' && this.rightJoystick.active;
  }

  containsControlPointer(pointer: Phaser.Input.Pointer): boolean {
    return this.inputMode === 'touch' && (this.leftJoystick.contains(pointer) || this.rightJoystick.contains(pointer));
  }

  private createHud(): void {
    const resolution = Math.max(3, window.devicePixelRatio || 1);
    this.hudText = this.add
      .text(14, 12, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '17px',
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
        fontSize: '14px',
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
        fontSize: '15px',
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
    const touchMode = this.inputMode === 'touch';

    this.leftJoystick?.layout();
    this.rightJoystick?.layout();
    this.leftJoystick?.setVisible(touchMode);
    this.rightJoystick?.setVisible(touchMode);
    this.hudText?.setPosition(14, 12);
    this.hudText?.setWordWrapWidth(compact ? Math.max(260, width - 220) : Math.max(320, width - 28));
    this.debugText?.setPosition(14, Math.max(140, height - 76)).setVisible(!compact);
    this.debugText?.setWordWrapWidth(Math.max(320, width - 28));
    this.controlsHint?.setPosition(width / 2, Math.max(24, height - 26)).setVisible(!compact && touchMode);
    this.controlsHint?.setWordWrapWidth(Math.max(320, width - 48));
  }

  private updateHud(state: HudState): void {
    this.hudText.setText([
      state.title,
      state.planet,
      state.stats,
      state.inventory,
      `Input: ${state.inputMode}`,
    ]);
    this.debugText.setText([
      state.debug,
      state.target,
    ]);
  }

  private updateInputMode(): void {
    const previous = this.inputMode;
    const gamepad = navigator.getGamepads?.().find((pad) => Boolean(pad));
    if (gamepad) {
      this.inputMode = 'gamepad';
    } else if (this.isTouchDevice()) {
      this.inputMode = 'touch';
    } else {
      this.inputMode = 'desktop';
    }

    if (previous !== this.inputMode) this.layout();
  }

  private isTouchDevice(): boolean {
    const smallTouchViewport = navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) < 768;
    return window.matchMedia('(pointer: coarse)').matches || smallTouchViewport;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.inputMode !== 'touch') return;
    const handledLeft = this.leftJoystick.handlePointerDown(pointer);
    const handledRight = this.rightJoystick.handlePointerDown(pointer);
    if (handledLeft || handledRight) pointer.event.preventDefault();
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.inputMode !== 'touch') return;
    this.leftJoystick.handlePointerMove(pointer);
    this.rightJoystick.handlePointerMove(pointer);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.inputMode !== 'touch') return;
    this.leftJoystick.handlePointerUp(pointer);
    this.rightJoystick.handlePointerUp(pointer);
  }
}
