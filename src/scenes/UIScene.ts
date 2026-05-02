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
  private hpLabel!: Phaser.GameObjects.Text;
  private hpValue!: Phaser.GameObjects.Text;
  private fuelLabel!: Phaser.GameObjects.Text;
  private fuelValue!: Phaser.GameObjects.Text;
  private energyLabel!: Phaser.GameObjects.Text;
  private energyValue!: Phaser.GameObjects.Text;
  private cargoLabel!: Phaser.GameObjects.Text;
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

    this.hpLabel = this.add.text(0, 0, 'HP', TEXT.label).setScrollFactor(0).setDepth(11).setResolution(resolution);
    this.hpValue = this.add.text(0, 0, '', TEXT.value).setScrollFactor(0).setDepth(11).setResolution(resolution);
    this.fuelLabel = this.add.text(0, 0, 'SHIP FUEL', TEXT.label).setScrollFactor(0).setDepth(11).setResolution(resolution);
    this.fuelValue = this.add.text(0, 0, '', TEXT.value).setScrollFactor(0).setDepth(11).setResolution(resolution);
    this.energyLabel = this.add.text(0, 0, 'SUIT ENERGY', { ...TEXT.label, color: '#67e8f9' }).setScrollFactor(0).setDepth(11).setResolution(resolution);
    this.energyValue = this.add.text(0, 0, '', TEXT.value).setScrollFactor(0).setDepth(11).setResolution(resolution);
    this.cargoLabel = this.add.text(0, 0, 'CARGO', TEXT.label).setScrollFactor(0).setDepth(11).setResolution(resolution);
    this.brandLabel = this.add.text(0, 0, 'GRAVITY DIG', TEXT.small).setScrollFactor(0).setDepth(11).setResolution(resolution);

    for (let i = 0; i < 4; i += 1) {
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
    const scale = Phaser.Math.Clamp(width / 1280, 0.72, 1) * 0.68;
    this.drawStatusPanel(12, 12, scale, state);
    this.drawActionPanel(width / 2, height - 110 * scale, scale, state);
  }

  private drawStatusPanel(x: number, y: number, scale: number, state: HudState): void {
    const g = this.statusGraphics.clear();
    const w = 350 * scale;
    const h = 154 * scale;
    const rowH = 56 * scale;

    this.drawPanel(g, x, y, w, h, 0x0a0d10, 0.9, 0x5b6470);
    this.drawCornerBolts(g, x, y, w, h, scale);
    this.drawSmallMeter(g, x + 72 * scale, y + 30 * scale, 230 * scale, rowH, state.health, 0xef1f2d, 0x7f1119);
    this.drawSmallMeter(g, x + 72 * scale, y + 88 * scale, 230 * scale, rowH, state.fuel, 0xf97316, 0x92400e);

    this.drawIconBox(g, x + 22 * scale, y + 30 * scale, 44 * scale, 0xef1f2d, 'hp');
    this.drawIconBox(g, x + 22 * scale, y + 88 * scale, 44 * scale, 0xf97316, 'fuel');

    this.hpLabel.setPosition(x + 80 * scale, y + 36 * scale).setScale(scale);
    this.hpValue.setText(`${Math.round(state.health.current)}/${state.health.max}`)
      .setPosition(x + 270 * scale, y + 32 * scale)
      .setScale(scale);
    this.fuelLabel.setPosition(x + 80 * scale, y + 94 * scale).setScale(scale);
    this.fuelValue.setText(`${Math.round(state.fuel.current)}/${state.fuel.max}`)
      .setPosition(x + 270 * scale, y + 90 * scale)
      .setScale(scale);
  }

  private drawActionPanel(centerX: number, y: number, scale: number, state: HudState): void {
    const g = this.actionGraphics.clear();
    const w = 760 * scale;
    const h = 128 * scale;
    const x = centerX - w / 2;
    const energyX = x + 58 * scale;
    const energyY = y + 36 * scale;
    const cargoX = x + 375 * scale;
    const slotSize = 64 * scale;
    const gap = 10 * scale;

    this.drawPanel(g, x, y, w, h, 0x0a0d10, 0.92, 0x656b73);
    this.drawCornerBolts(g, x, y, w, h, scale);
    this.drawEnergyMeter(g, energyX, energyY, 260 * scale, 44 * scale, state.energy);

    g.lineStyle(2 * scale, 0x606873, 0.8);
    g.lineBetween(x + 345 * scale, y + 18 * scale, x + 345 * scale, y + h - 18 * scale);

    this.energyLabel.setPosition(x + 132 * scale, y + 16 * scale).setScale(scale);
    this.cargoLabel.setPosition(cargoX + 130 * scale, y + 16 * scale).setScale(scale);
    this.brandLabel.setPosition(centerX - 34 * scale, y + h - 22 * scale).setScale(scale * 0.78);

    this.energyValue.setText(`${Math.round(state.energy.current)} / ${state.energy.max}`)
      .setPosition(energyX + 78 * scale, y + 88 * scale)
      .setScale(scale);

    for (let i = 0; i < state.cargo.visibleSlots; i += 1) {
      const slot = state.cargo.slots[i];
      const sx = cargoX + i * (slotSize + gap);
      const sy = y + 44 * scale;
      this.drawCargoSlot(g, sx, sy, slotSize, slot, Boolean(slot), state.cargo.stackLimit, scale);
      const label = this.slotLabels[i];
      label.setVisible(Boolean(slot?.itemId && slot.quantity > 0));
      if (slot?.itemId && slot.quantity > 0) {
        label.setText(`x${slot.quantity}`).setPosition(sx + slotSize - 6 * scale, sy + slotSize - 5 * scale).setScale(scale * 0.82);
      }
    }
  }

  private drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, alpha: number, stroke: number): void {
    g.fillStyle(0x020617, 0.35).fillRoundedRect(x + 6, y + 7, w, h, 8);
    g.fillStyle(color, alpha).fillRoundedRect(x, y, w, h, 10);
    g.lineStyle(3, stroke, 0.9).strokeRoundedRect(x, y, w, h, 10);
    g.lineStyle(1, 0xd1d5db, 0.24).strokeRoundedRect(x + 7, y + 7, w - 14, h - 14, 6);
  }

  private drawCornerBolts(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, scale: number): void {
    g.fillStyle(0x111827, 1);
    for (const [bx, by] of [[x + 16 * scale, y + 16 * scale], [x + w - 16 * scale, y + 16 * scale], [x + 16 * scale, y + h - 16 * scale], [x + w - 16 * scale, y + h - 16 * scale]]) {
      g.fillCircle(bx, by, 4 * scale);
      g.lineStyle(1 * scale, 0x94a3b8, 0.75).strokeCircle(bx, by, 4 * scale);
    }
  }

  private drawSmallMeter(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, meter: HudMeterState, fill: number, dark: number): void {
    const pct = Phaser.Math.Clamp(meter.current / meter.max, 0, 1);
    g.fillStyle(0x0f172a, 0.95).fillRoundedRect(x, y, w, h - 8, 5);
    g.fillStyle(0x020617, 1).fillRoundedRect(x + 8, y + 28, w - 16, 16, 4);
    this.drawSegments(g, x + 12, y + 31, w - 24, 10, 18, pct, fill, dark);
  }

  private drawEnergyMeter(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, meter: HudMeterState): void {
    const pct = Phaser.Math.Clamp(meter.current / meter.max, 0, 1);
    g.fillStyle(0x020617, 1).fillRoundedRect(x, y, w, h, 8);
    g.lineStyle(3, 0x155e75, 0.9).strokeRoundedRect(x, y, w, h, 8);
    g.fillStyle(0x22d3ee, 0.12).fillRoundedRect(x - 8, y - 4, w + 16, h + 8, 10);
    this.drawSegments(g, x + 12, y + 10, w - 24, h - 20, 18, pct, 0x22d3ee, 0x164e63);
    g.fillStyle(0x67e8f9, 0.7).fillCircle(x + w - 22, y + h / 2, 5);
  }

  private drawSegments(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, count: number, pct: number, fill: number, dark: number): void {
    const gap = 2;
    const segW = (w - gap * (count - 1)) / count;
    const active = Math.round(count * pct);
    for (let i = 0; i < count; i += 1) {
      g.fillStyle(i < active ? fill : dark, i < active ? 0.95 : 0.5);
      g.fillRoundedRect(x + i * (segW + gap), y, segW, h, 2);
    }
  }

  private drawCargoSlot(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, slot: InventorySlot | undefined, active: boolean, _stackLimit: number, scale: number): void {
    g.fillStyle(active ? 0x15120d : 0x05070a, 0.98).fillRoundedRect(x, y, size, size, 7 * scale);
    g.lineStyle(3 * scale, active ? 0xc0843d : 0x334155, active ? 0.9 : 0.65).strokeRoundedRect(x, y, size, size, 7 * scale);
    g.lineStyle(1 * scale, active ? 0xf8d08a : 0x64748b, active ? 0.4 : 0.2).strokeRoundedRect(x + 6 * scale, y + 6 * scale, size - 12 * scale, size - 12 * scale, 5 * scale);

    if (!active) {
      this.drawLock(g, x + size / 2, y + size / 2, scale);
      return;
    }

    if (!slot?.itemId || slot.quantity <= 0) {
      g.fillStyle(0x64748b, 0.18).fillCircle(x + size / 2, y + size / 2, size * 0.22);
      return;
    }

    const color = this.itemColor(slot.itemId);
    g.fillStyle(color, 0.95).fillCircle(x + size / 2, y + size / 2, size * 0.25);
    g.fillStyle(0xffffff, 0.22).fillCircle(x + size / 2 - size * 0.08, y + size / 2 - size * 0.08, size * 0.08);
    g.fillStyle(0x020617, 0.82).fillRoundedRect(x + size - 26 * scale, y + size - 20 * scale, 24 * scale, 18 * scale, 5 * scale);
  }

  private drawIconBox(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, color: number, kind: 'hp' | 'fuel'): void {
    g.fillStyle(0x111827, 0.95).fillRoundedRect(x, y, size, size, 7);
    g.lineStyle(2, color, 0.8).strokeRoundedRect(x, y, size, size, 7);
    if (kind === 'hp') {
      g.fillStyle(color, 0.95).fillCircle(x + size * 0.38, y + size * 0.39, size * 0.13);
      g.fillCircle(x + size * 0.62, y + size * 0.39, size * 0.13);
      g.fillTriangle(x + size * 0.25, y + size * 0.47, x + size * 0.75, y + size * 0.47, x + size * 0.5, y + size * 0.76);
      return;
    }
    g.lineStyle(4, color, 0.95).strokeRoundedRect(x + size * 0.32, y + size * 0.24, size * 0.32, size * 0.48, 3);
    g.lineStyle(2, color, 0.95).lineBetween(x + size * 0.64, y + size * 0.34, x + size * 0.76, y + size * 0.46);
  }

  private drawLock(g: Phaser.GameObjects.Graphics, cx: number, cy: number, scale: number): void {
    g.lineStyle(5 * scale, 0x64748b, 0.85).strokeRoundedRect(cx - 12 * scale, cy - 20 * scale, 24 * scale, 24 * scale, 10 * scale);
    g.fillStyle(0x111827, 1).fillRoundedRect(cx - 17 * scale, cy - 2 * scale, 34 * scale, 28 * scale, 4 * scale);
    g.lineStyle(2 * scale, 0x94a3b8, 0.7).strokeRoundedRect(cx - 17 * scale, cy - 2 * scale, 34 * scale, 28 * scale, 4 * scale);
    g.fillStyle(0x94a3b8, 0.8).fillCircle(cx, cy + 10 * scale, 3 * scale);
  }

  private itemColor(itemId: string): number {
    switch (itemId) {
      case 'copper': return 0xb45309;
      case 'iron': return 0x94a3b8;
      case 'gold': return 0xfbbf24;
      case 'diamond': return 0x67e8f9;
      case 'basalt': return 0x475569;
      case 'stone': return 0x78716c;
      default: return 0x8b5e34;
    }
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
