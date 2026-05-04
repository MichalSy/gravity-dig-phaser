import Phaser from 'phaser';
import { VirtualJoystick } from '../controls/VirtualJoystick';
import { DeveloperDialog } from '../debug/DeveloperDialog';
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

const UI_LAYOUT = {
  statusFrame: { w: 787, h: 341, displayWidth: 360 },
  statusHpBar: { x: 232, y: 82, w: 457, h: 54 },
  statusFuelBar: { x: 232, y: 205, w: 457, h: 54 },
  actionFrame: { w: 1402, h: 317, displayHeight: 150 },
  actionEnergyBar: { x: 110, y: 142, w: 457, h: 54 },
  actionSlotCenters: [
    { x: 725, y: 155 },
    { x: 898, y: 155 },
    { x: 1071, y: 155 },
    { x: 1245, y: 155 },
  ],
  slotContentSize: 108,
} as const;

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
  private developerButton!: Phaser.GameObjects.Text;
  private developerDialog!: DeveloperDialog;
  private collisionDebugEnabled = false;
  private inputMode: InputMode = 'desktop';
  private latestHud?: HudState;

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
      this.developerDialog.destroy();
    });
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
    this.statusGraphics = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.actionGraphics = this.add.graphics().setScrollFactor(0).setDepth(10);

    this.statusFrame = this.add.image(0, 0, 'hud-status-frame').setOrigin(0, 0).setScrollFactor(0).setDepth(10);
    this.actionFrame = this.add.image(0, 0, 'hud-action-frame').setOrigin(0, 0).setScrollFactor(0).setDepth(10);
    this.hpFill = this.add.image(0, 0, 'hud-bar-red').setOrigin(0, 0).setScrollFactor(0).setDepth(11);
    this.fuelFill = this.add.image(0, 0, 'hud-bar-orange').setOrigin(0, 0).setScrollFactor(0).setDepth(11);
    this.energyFill = this.add.image(0, 0, 'hud-bar-cyan').setOrigin(0, 0).setScrollFactor(0).setDepth(11);
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
      this.slotFrames.push(this.add.image(0, 0, 'hud-slot-locked').setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(11).setVisible(false));
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

    const bottomHudHeight = UI_LAYOUT.actionFrame.displayHeight * Phaser.Math.Clamp(width / 1280, 0.72, 1);
    this.debugText?.setOrigin(0, 1).setPosition(14, height - bottomHudHeight - 24).setVisible(true);
    this.debugText?.setWordWrapWidth(Math.max(320, Math.min(560, width - 28)));
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
    const atlasScale = (UI_LAYOUT.statusFrame.displayWidth * scale) / UI_LAYOUT.statusFrame.w;
    const pctHp = Phaser.Math.Clamp(state.health.current / state.health.max, 0, 1);
    const pctFuel = Phaser.Math.Clamp(state.fuel.current / state.fuel.max, 0, 1);

    this.statusFrame
      .setPosition(x, y)
      .setCrop()
      .setScale(atlasScale)
      .setVisible(true);

    this.placeImageBar(this.hpFill, x + UI_LAYOUT.statusHpBar.x * atlasScale, y + UI_LAYOUT.statusHpBar.y * atlasScale, atlasScale, pctHp);
    this.placeImageBar(this.fuelFill, x + UI_LAYOUT.statusFuelBar.x * atlasScale, y + UI_LAYOUT.statusFuelBar.y * atlasScale, atlasScale, pctFuel);

    this.hpIcon.setVisible(false);
    this.fuelIcon.setVisible(false);
    this.hpLabel.setVisible(false);
    this.hpValue.setVisible(false);
    this.fuelLabel.setVisible(false);
    this.fuelValue.setVisible(false);
    this.statusBrandLabel.setVisible(false);
  }

  private drawActionPanel(centerX: number, _y: number, scale: number, state: HudState): void {
    this.actionGraphics.clear();
    const atlasScale = (UI_LAYOUT.actionFrame.displayHeight * scale) / UI_LAYOUT.actionFrame.h;
    const frameW = UI_LAYOUT.actionFrame.w * atlasScale;
    const x = centerX - frameW / 2;
    const dockY = this.scale.height - UI_LAYOUT.actionFrame.h * atlasScale - 10 * scale;
    const pctEnergy = Phaser.Math.Clamp(state.energy.current / state.energy.max, 0, 1);

    this.actionFrame
      .setPosition(x, dockY)
      .setCrop()
      .setScale(atlasScale)
      .setVisible(true);
    this.placeImageBar(this.energyFill, x + UI_LAYOUT.actionEnergyBar.x * atlasScale, dockY + UI_LAYOUT.actionEnergyBar.y * atlasScale, atlasScale, pctEnergy);

    this.energyLabel.setVisible(false);
    this.energyValue.setVisible(false);
    this.cargoLabel.setVisible(false);
    this.brandLabel.setVisible(false);

    for (let i = 0; i < this.slotLabels.length; i += 1) {
      const label = this.slotLabels[i];
      const frame = this.slotFrames[i];
      const item = this.slotItems[i];
      const active = i < state.cargo.visibleSlots;
      const slot = state.cargo.slots[i];
      const slotCenter = UI_LAYOUT.actionSlotCenters[i];
      const itemX = x + slotCenter.x * atlasScale;
      const itemY = dockY + slotCenter.y * atlasScale;
      const itemSize = UI_LAYOUT.slotContentSize * atlasScale;

      frame
        .setPosition(itemX, itemY)
        .setScale((166 * atlasScale) / frame.width)
        .setVisible(!active);

      const hasItem = Boolean(active && slot?.itemId && slot.quantity > 0);
      item
        .setPosition(itemX, itemY)
        .setDisplaySize(itemSize, itemSize)
        .setVisible(hasItem);

      label.setVisible(hasItem);
      if (hasItem) {
        label
          .setText(`x${slot?.quantity ?? 0}`)
          .setPosition(itemX + itemSize / 2 - 4 * atlasScale, itemY + itemSize / 2 - 4 * atlasScale)
          .setScale(atlasScale * 4.05);
      }
    }
  }

  private placeImageBar(
    bar: Phaser.GameObjects.Image,
    x: number,
    y: number,
    scale: number,
    pct: number,
  ): void {
    const safePct = Phaser.Math.Clamp(pct, 0, 1);
    const cropWidth = Math.max(1, Math.round(bar.width * safePct));

    bar
      .setPosition(x, y)
      .setCrop(0, 0, cropWidth, bar.height)
      .setScale(scale)
      .setVisible(safePct > 0);
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
