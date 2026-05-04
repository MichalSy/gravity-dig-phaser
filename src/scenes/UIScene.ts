import Phaser from 'phaser';
import { VirtualJoystick } from '../controls/VirtualJoystick';
import { DeveloperDialog } from '../debug/DeveloperDialog';
import { NodeRuntime } from '../nodes';
import { GameplayUiScene, bottomHudDisplayHeight } from '../ui/GameplayUiScene';
import type { HudState, InputMode } from '../ui/HudState';

interface HudTextStyle extends Phaser.Types.GameObjects.Text.TextStyle {
  fontFamily: string;
  fontSize: string;
  color: string;
}

const TEXT = {
  label: { fontFamily: 'Arial, sans-serif', fontSize: '14px', fontStyle: '800', color: '#cbd5e1' } satisfies HudTextStyle,
  value: { fontFamily: 'Arial, sans-serif', fontSize: '15px', fontStyle: '800', color: '#f8fafc' } satisfies HudTextStyle,
  small: { fontFamily: 'Arial, sans-serif', fontSize: '11px', fontStyle: '800', color: '#94a3b8' } satisfies HudTextStyle,
};

export class UIScene extends Phaser.Scene {
  private leftJoystick!: VirtualJoystick;
  private rightJoystick!: VirtualJoystick;
  private hudRuntime!: NodeRuntime;
  private gameplayUiScene!: GameplayUiScene;
  private debugText!: Phaser.GameObjects.Text;
  private controlsHint!: Phaser.GameObjects.Text;
  private debugPanel!: Phaser.GameObjects.Container;
  private collisionButton!: Phaser.GameObjects.Text;
  private developerButton!: Phaser.GameObjects.Text;
  private developerDialog!: DeveloperDialog;
  private collisionDebugEnabled = false;
  private inputMode: InputMode = 'desktop';

  constructor() {
    super('ui');
  }

  create(): void {
    this.input.addPointer(3);
    this.developerDialog = new DeveloperDialog(this);
    this.createHud();
    this.createDebugMenu();
    this.leftJoystick = new VirtualJoystick(this, 'left', 'MOVE');
    this.rightJoystick = new VirtualJoystick(this, 'right', 'LASER');
    this.layout();

    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUp, this);
    this.scale.on('resize', this.layout, this);
    this.game.events.on('hud:update', this.updateHud, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.layout, this);
      this.game.events.off('hud:update', this.updateHud, this);
      this.hudRuntime.destroy();
      this.developerDialog.destroy();
    });
    this.updateInputMode();
  }

  update(_time: number, deltaMs: number): void {
    this.updateInputMode();
    this.hudRuntime.update(deltaMs);
    this.hudRuntime.render();
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
    return !this.isMenuOpen() && this.inputMode === 'touch' && this.rightJoystick.active;
  }

  isMenuOpen(): boolean {
    return this.developerDialog?.isOpen() ?? false;
  }

  containsControlPointer(pointer: Phaser.Input.Pointer): boolean {
    return this.inputMode === 'touch' && (this.leftJoystick.contains(pointer) || this.rightJoystick.contains(pointer));
  }

  private createHud(): void {
    const resolution = Math.max(2, window.devicePixelRatio || 1);
    this.hudRuntime = new NodeRuntime({ phaserScene: this });
    this.gameplayUiScene = this.hudRuntime.addScene(new GameplayUiScene());
    this.hudRuntime.init();
    this.hudRuntime.resolve();

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
      .setDepth(40)
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
      .setDepth(40)
      .setResolution(resolution);
  }

  private createDebugMenu(): void {
    const bg = this.add
      .rectangle(0, 0, 156, 86, 0x020617, 0.72)
      .setStrokeStyle(1, 0x38bdf8, 0.65)
      .setOrigin(1, 0)
      .setScrollFactor(0);

    const title = this.add
      .text(-144, 7, 'DEBUG', TEXT.small)
      .setScrollFactor(0)
      .setResolution(Math.max(2, window.devicePixelRatio || 1));

    this.collisionButton = this.add
      .text(-144, 24, 'Collision: OFF', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        fontStyle: '700',
        color: '#f8fafc',
        backgroundColor: 'rgba(15,23,42,0.88)',
        padding: { x: 8, y: 4 },
      })
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .setResolution(Math.max(2, window.devicePixelRatio || 1));

    this.collisionButton.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.preventDefault();
      pointer.event.stopPropagation();
      this.toggleCollisionDebug();
    });

    this.developerButton = this.add
      .text(-144, 56, 'Developer', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        fontStyle: '700',
        color: '#082f49',
        backgroundColor: 'rgba(103,232,249,0.92)',
        padding: { x: 8, y: 4 },
      })
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .setResolution(Math.max(2, window.devicePixelRatio || 1));

    this.developerButton.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.preventDefault();
      pointer.event.stopPropagation();
      this.developerDialog.toggle();
    });

    this.debugPanel = this.add.container(0, 0, [bg, title, this.collisionButton, this.developerButton]).setDepth(40).setScrollFactor(0);
  }

  private layout(): void {
    if (!this.debugPanel?.active) return;

    const width = this.scale.width;
    const height = this.scale.height;
    const compact = height <= 430 || width <= 760;
    const touchMode = this.inputMode === 'touch';

    this.leftJoystick?.layout();
    this.rightJoystick?.layout();
    if (!touchMode) {
      this.leftJoystick?.setVisible(false);
      this.rightJoystick?.setVisible(false);
    }

    const bottomHudHeight = bottomHudDisplayHeight(width);
    this.debugText?.setOrigin(0, 1).setPosition(14, height - bottomHudHeight - 24).setVisible(true);
    this.debugText?.setWordWrapWidth(Math.max(320, Math.min(560, width - 28)));
    this.controlsHint?.setPosition(width / 2, Math.max(24, height - 26)).setVisible(!compact && touchMode);
    this.controlsHint?.setWordWrapWidth(Math.max(320, width - 48));
    this.debugPanel?.setPosition(width - 12, 12);
  }

  private updateHud(state: HudState): void {
    this.gameplayUiScene.setHudState(state);
    this.debugText.setText([
      state.debug,
      state.zoom,
      state.target,
    ]);
  }

  private toggleCollisionDebug(): void {
    this.collisionDebugEnabled = !this.collisionDebugEnabled;
    this.collisionButton.setText(`Collision: ${this.collisionDebugEnabled ? 'ON' : 'OFF'}`);
    this.collisionButton.setColor(this.collisionDebugEnabled ? '#86efac' : '#f8fafc');
    this.game.events.emit('debug:collision', this.collisionDebugEnabled);
  }

  private isDebugMenuPointer(pointer: Phaser.Input.Pointer): boolean {
    if (!this.debugPanel) return false;
    const panelLeft = this.scale.width - 168;
    return pointer.x >= panelLeft && pointer.x <= this.scale.width - 12 && pointer.y >= 12 && pointer.y <= 98;
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
    if (this.isDebugMenuPointer(pointer) || this.isMenuOpen()) return;
    if (this.inputMode !== 'touch') return;
    const handled = pointer.x < this.scale.width / 2
      ? this.leftJoystick.handlePointerDown(pointer)
      : this.rightJoystick.handlePointerDown(pointer);
    if (handled) pointer.event.preventDefault();
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.isMenuOpen() || this.inputMode !== 'touch') return;
    this.leftJoystick.handlePointerMove(pointer);
    this.rightJoystick.handlePointerMove(pointer);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.isMenuOpen() || this.inputMode !== 'touch') return;
    this.leftJoystick.handlePointerUp(pointer);
    this.rightJoystick.handlePointerUp(pointer);
  }
}
