import Phaser from 'phaser';
import { VirtualJoystick } from '../controls/VirtualJoystick';
import type { InventorySlot } from '../player/types';

export type InputMode = 'touch' | 'desktop' | 'gamepad';

export interface HudMeterState {
  current: number;
  max: number;
}

export interface HudCargoState {
  slots: InventorySlot[];
  visibleSlots: number;
  stackLimit: number;
}

export interface HudState {
  title: string;
  planet: string;
  health: HudMeterState;
  energy: HudMeterState;
  fuel: HudMeterState;
  cargo: HudCargoState;
  debug: string;
  target: string;
  zoom: string;
  inputMode: InputMode;
}

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
  private statusGraphics!: Phaser.GameObjects.Graphics;
  private actionGraphics!: Phaser.GameObjects.Graphics;
  private statusFrame!: Phaser.GameObjects.Image;
  private actionFrame!: Phaser.GameObjects.Image;
  private hpFill!: Phaser.GameObjects.Image;
  private fuelFill!: Phaser.GameObjects.Image;
  private energyFill!: Phaser.GameObjects.Image;
  private hpIcon!: Phaser.GameObjects.Image;
  private fuelIcon!: Phaser.GameObjects.Image;
  private slotFrames: Phaser.GameObjects.Image[] = [];
  private slotItems: Phaser.GameObjects.Image[] = [];
  private hpLabel!: Phaser.GameObjects.Text;
  private hpValue!: Phaser.GameObjects.Text;
  private fuelLabel!: Phaser.GameObjects.Text;
  private fuelValue!: Phaser.GameObjects.Text;
  private energyLabel!: Phaser.GameObjects.Text;
  private energyValue!: Phaser.GameObjects.Text;
  private cargoLabel!: Phaser.GameObjects.Text;
  private statusBrandLabel!: Phaser.GameObjects.Text;
  private brandLabel!: Phaser.GameObjects.Text;
  private slotLabels: Phaser.GameObjects.Text[] = [];
  private debugText!: Phaser.GameObjects.Text;
  private controlsHint!: Phaser.GameObjects.Text;
  private debugPanel!: Phaser.GameObjects.Container;
  private collisionButton!: Phaser.GameObjects.Text;
  private collisionDebugEnabled = false;
  private inputMode: InputMode = 'desktop';
  private latestHud?: HudState;

  constructor() {
    super('ui');
  }

  create(): void {
    this.input.addPointer(3);
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
    const resolution = Math.max(2, window.devicePixelRatio || 1);
    this.statusGraphics = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.actionGraphics = this.add.graphics().setScrollFactor(0).setDepth(10);

    this.statusFrame = this.add.image(0, 0, 'hud-status-frame').setOrigin(0, 0).setScrollFactor(0).setDepth(10);
    this.actionFrame = this.add.image(0, 0, 'hud-v10-bottom-frame').setOrigin(0, 0).setScrollFactor(0).setDepth(10);
    this.hpFill = this.add.image(0, 0, 'hud-bar-red').setOrigin(0, 0).setScrollFactor(0).setDepth(11);
    this.fuelFill = this.add.image(0, 0, 'hud-bar-orange').setOrigin(0, 0).setScrollFactor(0).setDepth(11);
    this.energyFill = this.add.image(0, 0, 'hud-v10-energy-fill').setOrigin(0, 0).setScrollFactor(0).setDepth(11);
    this.hpIcon = this.add.image(0, 0, 'hud-icon-hp').setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(11);
    this.fuelIcon = this.add.image(0, 0, 'hud-icon-fuel').setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(11);

    this.hpLabel = this.add.text(0, 0, 'HP', TEXT.label).setScrollFactor(0).setDepth(11).setResolution(resolution);
    this.hpValue = this.add.text(0, 0, '', TEXT.value).setScrollFactor(0).setDepth(11).setResolution(resolution);
    this.fuelLabel = this.add.text(0, 0, 'SHIP FUEL', TEXT.label).setScrollFactor(0).setDepth(11).setResolution(resolution);
    this.fuelValue = this.add.text(0, 0, '', TEXT.value).setScrollFactor(0).setDepth(11).setResolution(resolution);
    this.energyLabel = this.add.text(0, 0, 'SUIT ENERGY', { ...TEXT.label, color: '#67e8f9' }).setScrollFactor(0).setDepth(11).setResolution(resolution);
    this.energyValue = this.add.text(0, 0, '', TEXT.value).setScrollFactor(0).setDepth(11).setResolution(resolution);
    this.cargoLabel = this.add.text(0, 0, 'CARGO', TEXT.label).setScrollFactor(0).setDepth(11).setResolution(resolution);
    this.statusBrandLabel = this.add.text(0, 0, 'GRAVITY DIG', TEXT.small).setOrigin(0.5, 0).setScrollFactor(0).setDepth(11).setResolution(resolution);
    this.brandLabel = this.add.text(0, 0, 'GRAVITY DIG', TEXT.small).setOrigin(0.5, 0).setScrollFactor(0).setDepth(11).setResolution(resolution);

    for (let i = 0; i < 4; i += 1) {
      this.slotFrames.push(this.add.image(0, 0, 'hud-v10-slot-empty').setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(11).setVisible(false));
      this.slotItems.push(this.add.image(0, 0, 'hud-item-rock').setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(12).setVisible(false));
      this.slotLabels.push(this.add.text(0, 0, '', TEXT.value).setOrigin(1, 1).setScrollFactor(0).setDepth(12).setResolution(resolution));
    }

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

  private createDebugMenu(): void {
    const bg = this.add
      .rectangle(0, 0, 156, 52, 0x020617, 0.72)
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

    this.debugPanel = this.add.container(0, 0, [bg, title, this.collisionButton]).setDepth(40).setScrollFactor(0);
  }

  private layout(): void {
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

    this.debugText?.setPosition(14, 188).setVisible(false);
    this.debugText?.setWordWrapWidth(Math.max(320, width - 28));
    this.controlsHint?.setPosition(width / 2, Math.max(24, height - 26)).setVisible(!compact && touchMode);
    this.controlsHint?.setWordWrapWidth(Math.max(320, width - 48));
    this.debugPanel?.setPosition(width - 12, 12);

    if (this.latestHud) this.drawHud(this.latestHud);
  }

  private updateHud(state: HudState): void {
    this.latestHud = state;
    this.drawHud(state);
    this.debugText.setText([
      state.debug,
      state.zoom,
      state.target,
    ]);
  }

  private drawHud(state: HudState): void {
    const width = this.scale.width;
    const height = this.scale.height;
    const scale = Phaser.Math.Clamp(width / 1280, 0.72, 1);
    this.drawStatusPanel(18, 18, scale, state);
    this.drawActionPanel(width / 2, height - 178 * scale, scale, state);
  }

  private drawStatusPanel(x: number, y: number, scale: number, state: HudState): void {
    this.statusGraphics.clear();
    const w = 360 * scale;
    const h = 156 * scale;
    const pctHp = Phaser.Math.Clamp(state.health.current / state.health.max, 0, 1);
    const pctFuel = Phaser.Math.Clamp(state.fuel.current / state.fuel.max, 0, 1);

    this.statusFrame.setPosition(x, y).setDisplaySize(w, h).setVisible(true);
    this.hpIcon.setPosition(x + 61 * scale, y + 53 * scale).setDisplaySize(32 * scale, 30 * scale).setVisible(true);
    this.fuelIcon.setPosition(x + 60 * scale, y + 107 * scale).setDisplaySize(26 * scale, 32 * scale).setVisible(true);

    this.placeCroppedBar(this.hpFill, x + 98 * scale, y + 50 * scale, 228 * scale, 17 * scale, pctHp);
    this.placeCroppedBar(this.fuelFill, x + 98 * scale, y + 103 * scale, 228 * scale, 17 * scale, pctFuel);

    this.hpLabel.setPosition(x + 102 * scale, y + 34 * scale).setScale(scale * 1.05).setVisible(true);
    this.hpValue.setText(`${Math.round(state.health.current)}/${state.health.max}`)
      .setPosition(x + 255 * scale, y + 33 * scale)
      .setScale(scale * 1.0)
      .setVisible(true);
    this.fuelLabel.setPosition(x + 102 * scale, y + 87 * scale).setScale(scale * 1.05).setVisible(true);
    this.fuelValue.setText(`${Math.round(state.fuel.current)}/${state.fuel.max}`)
      .setPosition(x + 255 * scale, y + 87 * scale)
      .setScale(scale * 1.0)
      .setVisible(true);
    this.statusBrandLabel.setVisible(false);
  }

  private drawActionPanel(centerX: number, _y: number, scale: number, state: HudState): void {
    this.actionGraphics.clear();
    const frameScale = scale * 0.65;
    const frameW = 820 * frameScale;
    const frameH = 143 * frameScale;
    const x = centerX - frameW / 2;
    const dockY = this.scale.height - frameH + 13 * frameScale;
    const contentScale = frameScale;
    const contentY = dockY;
    const pctEnergy = Phaser.Math.Clamp(state.energy.current / state.energy.max, 0, 1);

    this.actionFrame.setPosition(x, dockY).setDisplaySize(frameW, frameH).setVisible(true);
    this.placeCroppedBar(this.energyFill, x + 112 * contentScale, contentY + 71 * contentScale, 240 * contentScale, 22 * contentScale, pctEnergy);

    this.energyLabel.setVisible(false);
    this.cargoLabel.setVisible(false);
    this.brandLabel.setVisible(false);

    this.energyValue.setText(`${Math.round(state.energy.current)} / ${state.energy.max}`)
      .setPosition(x + 176 * contentScale, contentY + 101 * contentScale)
      .setScale(contentScale * 0.9)
      .setVisible(true);

    const slotSize = 66 * contentScale;
    const slotGap = 86 * contentScale;
    const firstSlotX = x + 507 * contentScale;
    const slotY = contentY + 48 * contentScale;

    for (let i = 0; i < this.slotLabels.length; i += 1) {
      const label = this.slotLabels[i];
      const frame = this.slotFrames[i];
      const item = this.slotItems[i];
      const active = i < state.cargo.visibleSlots;
      const slot = state.cargo.slots[i];
      const cx = firstSlotX + i * slotGap;
      const cy = slotY + slotSize / 2;
      const sx = cx - slotSize / 2;
      const sy = cy - slotSize / 2;
      const texture = active
        ? (i === 0 ? 'hud-v10-slot-active-empty' : 'hud-v10-slot-empty')
        : 'hud-v10-slot-locked';

      frame
        .setTexture(texture)
        .setPosition(cx, cy)
        .setDisplaySize(slotSize, slotSize)
        .setVisible(i < 3);

      const hasItem = Boolean(active && slot?.itemId && slot.quantity > 0);
      item
        .setPosition(cx, cy)
        .setDisplaySize(38 * contentScale, 38 * contentScale)
        .setVisible(hasItem && i < 3);

      label.setVisible(hasItem && i < 3);
      if (hasItem) {
        label.setText(`x${slot?.quantity ?? 0}`).setPosition(sx + slotSize - 6 * contentScale, sy + slotSize - 5 * contentScale).setScale(contentScale * 0.78);
      }
    }
  }

  private placeCroppedBar(bar: Phaser.GameObjects.Image, x: number, y: number, width: number, height: number, pct: number): void {
    const source = bar.texture.getSourceImage() as HTMLImageElement;
    const cropWidth = Math.max(1, Math.round(source.width * pct));
    bar
      .setPosition(x, y)
      .setCrop(0, 0, cropWidth, source.height)
      .setDisplaySize(width * pct, height)
      .setVisible(pct > 0);
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
    return pointer.x >= panelLeft && pointer.x <= this.scale.width - 12 && pointer.y >= 12 && pointer.y <= 64;
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
    if (this.isDebugMenuPointer(pointer)) return;
    if (this.inputMode !== 'touch') return;
    const handled = pointer.x < this.scale.width / 2
      ? this.leftJoystick.handlePointerDown(pointer)
      : this.rightJoystick.handlePointerDown(pointer);
    if (handled) pointer.event.preventDefault();
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
