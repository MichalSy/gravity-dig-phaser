import Phaser from 'phaser';
import { VirtualJoystick } from '../controls/VirtualJoystick';
import { DeveloperDialog } from '../debug/DeveloperDialog';
import { GAME_EVENTS, emitGameEvent } from '../game/gameEvents';
import { GameNode, NodeScene, type NodeContext } from '../nodes';
import type { HudState, InputMode } from './HudState';

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

const UI_ATLAS = {
  topHud: { x: 34, y: 34, w: 1242, h: 554 },
  hpBar: { x: 112, y: 650, w: 655, h: 95 },
  fuelBar: { x: 124, y: 818, w: 632, h: 81 },
  hpSlot: { x: 385 - 34, y: 200 - 34, w: 655, h: 95 },
  fuelSlot: { x: 395 - 34, y: 406 - 34, w: 637, h: 85 },
  topDisplayWidth: 400,
  bottomHud: { x: 55, y: 1002, w: 1194, h: 442 },
  energyBar: { x: 139, y: 1495, w: 401, h: 108 },
  energySlot: { x: 360 - 55, y: 1194 - 1002, w: 395, h: 125 },
  repeatSlot: { x: 866, y: 607, w: 374, h: 372 },
  extraSlotOrigin: { x: 1160, y: 65 },
  firstSlotCenter: { x: 1010, y: 265 },
  slotContentSize: 128,
  repeatSlotHeight: 372,
  repeatSlotStep: 360,
  bottomDisplayHeight: 180,
} as const;

const UI_DEPTH = 1000;

export function hudScaleForWidth(width: number): number {
  return Phaser.Math.Clamp(width / 1280, 0.5, 1);
}

export function bottomHudDisplayHeight(width: number): number {
  return UI_ATLAS.bottomDisplayHeight * hudScaleForWidth(width);
}

export class GameplayUiScene extends NodeScene {
  private hudState?: HudState;
  private inputMode: InputMode = 'desktop';

  constructor() {
    super({ sceneName: 'ui.gameplay', order: 100 });
    this.addChild(new StatusHudNode());
    this.addChild(new BottomHudNode());
    this.addChild(new RuntimeDebugTextNode());
    this.addChild(new DeveloperDialogNode());
    this.addChild(new DebugPanelNode());
    this.addChild(new TouchControlsNode());
  }

  update(): void {
    this.updateInputMode();
  }

  setHudState(state: HudState): void {
    this.hudState = state;
  }

  getHudState(): HudState | undefined {
    return this.hudState;
  }

  setInputMode(inputMode: InputMode): void {
    this.inputMode = inputMode;
  }

  getInputMode(): InputMode {
    return this.inputMode;
  }

  getMoveVector(): Phaser.Math.Vector2 {
    return this.requireNode<TouchControlsNode>('ui.touchControls').getMoveVector();
  }

  getAimVector(): Phaser.Math.Vector2 {
    return this.requireNode<TouchControlsNode>('ui.touchControls').getAimVector();
  }

  isAiming(): boolean {
    return !this.isMenuOpen() && this.inputMode === 'touch' && this.requireNode<TouchControlsNode>('ui.touchControls').isAiming();
  }

  isMenuOpen(): boolean {
    return this.requireNode<DeveloperDialogNode>('ui.developerDialog').isOpen();
  }

  containsControlPointer(pointer: Phaser.Input.Pointer): boolean {
    return this.inputMode === 'touch' && this.requireNode<TouchControlsNode>('ui.touchControls').containsPointer(pointer);
  }

  private updateInputMode(): void {
    const gamepad = navigator.getGamepads?.().find((pad) => Boolean(pad));
    if (gamepad) {
      this.inputMode = 'gamepad';
    } else if (this.isTouchDevice()) {
      this.inputMode = 'touch';
    } else {
      this.inputMode = 'desktop';
    }
  }

  private isTouchDevice(): boolean {
    const smallTouchViewport = navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) < 768;
    return window.matchMedia('(pointer: coarse)').matches || smallTouchViewport;
  }
}

class StatusHudNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private statusFrame!: Phaser.GameObjects.Image;
  private hpFill!: Phaser.GameObjects.Image;
  private fuelFill!: Phaser.GameObjects.Image;

  constructor() {
    super({ name: 'ui.statusHud', order: 0 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.statusFrame = this.phaserScene.add.image(0, 0, 'hud-hp-fuel-atlas').setOrigin(0, 0).setScrollFactor(0).setDepth(UI_DEPTH + 10);
    this.hpFill = this.phaserScene.add.image(0, 0, 'hud-hp-fuel-atlas').setOrigin(0, 0).setScrollFactor(0).setDepth(UI_DEPTH + 11);
    this.fuelFill = this.phaserScene.add.image(0, 0, 'hud-hp-fuel-atlas').setOrigin(0, 0).setScrollFactor(0).setDepth(UI_DEPTH + 11);
  }

  update(): void {
    const state = this.requireNode<GameplayUiScene>('ui.gameplay').getHudState();
    if (!state) return;

    const x = 18;
    const y = 18;
    const scale = hudScaleForWidth(this.phaserScene.scale.width);
    const atlasScale = (UI_ATLAS.topDisplayWidth * scale) / UI_ATLAS.topHud.w;
    const pctHp = Phaser.Math.Clamp(state.health.current / state.health.max, 0, 1);
    const pctFuel = Phaser.Math.Clamp(state.fuel.current / state.fuel.max, 0, 1);

    this.statusFrame
      .setPosition(x - UI_ATLAS.topHud.x * atlasScale, y - UI_ATLAS.topHud.y * atlasScale)
      .setCrop(UI_ATLAS.topHud.x, UI_ATLAS.topHud.y, UI_ATLAS.topHud.w, UI_ATLAS.topHud.h)
      .setScale(atlasScale)
      .setVisible(true);

    placeAtlasBar(this.hpFill, UI_ATLAS.hpBar, x + UI_ATLAS.hpSlot.x * atlasScale, y + UI_ATLAS.hpSlot.y * atlasScale, UI_ATLAS.hpSlot.w * atlasScale, UI_ATLAS.hpSlot.h * atlasScale, pctHp);
    placeAtlasBar(this.fuelFill, UI_ATLAS.fuelBar, x + UI_ATLAS.fuelSlot.x * atlasScale, y + UI_ATLAS.fuelSlot.y * atlasScale, UI_ATLAS.fuelSlot.w * atlasScale, UI_ATLAS.fuelSlot.h * atlasScale, pctFuel);
  }

  destroy(): void {
    this.statusFrame?.destroy();
    this.hpFill?.destroy();
    this.fuelFill?.destroy();
  }
}

class BottomHudNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private actionFrame!: Phaser.GameObjects.Image;
  private energyFill!: Phaser.GameObjects.Image;
  private readonly slotFrames: Phaser.GameObjects.Image[] = [];
  private readonly slotItems: Phaser.GameObjects.Image[] = [];
  private readonly slotLabels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ name: 'ui.bottomHud', order: 10 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    const resolution = Math.max(2, window.devicePixelRatio || 1);
    this.actionFrame = this.phaserScene.add.image(0, 0, 'hud-hp-fuel-atlas').setOrigin(0, 0).setScrollFactor(0).setDepth(UI_DEPTH + 11.1);
    this.energyFill = this.phaserScene.add.image(0, 0, 'hud-hp-fuel-atlas').setOrigin(0, 0).setScrollFactor(0).setDepth(UI_DEPTH + 11.2);

    for (let i = 0; i < 4; i += 1) {
      this.slotFrames.push(this.phaserScene.add.image(0, 0, 'hud-hp-fuel-atlas').setOrigin(0, 0).setScrollFactor(0).setDepth(UI_DEPTH + 10.8).setVisible(false));
      this.slotItems.push(this.phaserScene.add.image(0, 0, 'hud-item-rock').setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(UI_DEPTH + 12).setVisible(false));
      this.slotLabels.push(this.phaserScene.add.text(0, 0, '', TEXT.value).setOrigin(1, 1).setScrollFactor(0).setDepth(UI_DEPTH + 12).setResolution(resolution));
    }
  }

  update(): void {
    const state = this.requireNode<GameplayUiScene>('ui.gameplay').getHudState();
    if (!state) return;

    const scale = hudScaleForWidth(this.phaserScene.scale.width);
    const atlasScale = (UI_ATLAS.bottomDisplayHeight * scale) / UI_ATLAS.bottomHud.h;
    const extraSlotCount = Math.max(0, Math.min(this.slotFrames.length - 1, state.cargo.visibleSlots - 1));
    const frameW = (UI_ATLAS.bottomHud.w + extraSlotCount * UI_ATLAS.repeatSlotStep) * atlasScale;
    const x = this.phaserScene.scale.width / 2 - frameW / 2;
    const dockY = this.phaserScene.scale.height - UI_ATLAS.bottomHud.h * atlasScale - 10 * scale;
    const pctEnergy = Phaser.Math.Clamp(state.energy.current / state.energy.max, 0, 1);

    placeAtlasRegion(this.actionFrame, UI_ATLAS.bottomHud, x, dockY, atlasScale);
    placeAtlasBar(
      this.energyFill,
      UI_ATLAS.energyBar,
      x + UI_ATLAS.energySlot.x * atlasScale,
      dockY + UI_ATLAS.energySlot.y * atlasScale,
      UI_ATLAS.energySlot.w * atlasScale,
      UI_ATLAS.energySlot.h * atlasScale,
      pctEnergy,
    );

    const slotScale = (UI_ATLAS.repeatSlotHeight * atlasScale) / UI_ATLAS.repeatSlot.h;
    const repeatSlotW = UI_ATLAS.repeatSlot.w * slotScale;
    const repeatSlotH = UI_ATLAS.repeatSlot.h * slotScale;
    const firstExtraX = x + UI_ATLAS.extraSlotOrigin.x * atlasScale;
    const extraY = dockY + UI_ATLAS.extraSlotOrigin.y * atlasScale;

    for (let i = 0; i < this.slotLabels.length; i += 1) {
      const label = this.slotLabels[i];
      const frame = this.slotFrames[i];
      const item = this.slotItems[i];
      const active = i < state.cargo.visibleSlots;
      const slot = state.cargo.slots[i];
      const isExtraSlot = i > 0 && i <= extraSlotCount;
      const sx = firstExtraX + (i - 1) * UI_ATLAS.repeatSlotStep * atlasScale;
      const sy = extraY;
      const cx = sx + repeatSlotW / 2;
      const cy = sy + repeatSlotH / 2;

      if (isExtraSlot) {
        frame.setDepth(UI_DEPTH + 10.8 + (extraSlotCount - i) * 0.01);
        placeAtlasRegion(frame, UI_ATLAS.repeatSlot, sx, sy, slotScale);
      } else {
        frame.setVisible(false);
      }

      const hasItem = Boolean(active && slot?.itemId && slot.quantity > 0);
      const itemX = i === 0 ? x + UI_ATLAS.firstSlotCenter.x * atlasScale : cx;
      const itemY = i === 0 ? dockY + UI_ATLAS.firstSlotCenter.y * atlasScale : cy;
      const itemSize = UI_ATLAS.slotContentSize * atlasScale;
      item
        .setPosition(itemX, itemY)
        .setDisplaySize(itemSize, itemSize)
        .setVisible(hasItem && i < state.cargo.visibleSlots);

      label.setVisible(hasItem && i < state.cargo.visibleSlots);
      if (hasItem) {
        label
          .setText(`x${slot?.quantity ?? 0}`)
          .setPosition(itemX + itemSize / 2 - 4 * atlasScale, itemY + itemSize / 2 - 4 * atlasScale)
          .setScale(atlasScale * 4.05);
      }
    }
  }

  destroy(): void {
    this.actionFrame?.destroy();
    this.energyFill?.destroy();
    for (const object of [...this.slotFrames, ...this.slotItems, ...this.slotLabels]) object.destroy();
    this.slotFrames.length = 0;
    this.slotItems.length = 0;
    this.slotLabels.length = 0;
  }
}

class RuntimeDebugTextNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private debugText!: Phaser.GameObjects.Text;

  constructor() {
    super({ name: 'ui.runtimeDebugText', order: 20 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.debugText = this.phaserScene.add
      .text(14, 0, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        color: '#bfdbfe',
        backgroundColor: 'rgba(2,6,23,0.58)',
        padding: { x: 10, y: 8 },
        lineSpacing: 2,
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 40)
      .setResolution(Math.max(2, window.devicePixelRatio || 1));
  }

  update(): void {
    const state = this.requireNode<GameplayUiScene>('ui.gameplay').getHudState();
    if (!state) return;

    const width = this.phaserScene.scale.width;
    const height = this.phaserScene.scale.height;
    const bottomHudHeight = bottomHudDisplayHeight(width);
    this.debugText
      .setText([state.debug, state.zoom, state.target])
      .setOrigin(0, 1)
      .setPosition(14, height - bottomHudHeight - 24)
      .setWordWrapWidth(Math.max(320, Math.min(560, width - 28)))
      .setVisible(true);
  }

  destroy(): void {
    this.debugText?.destroy();
  }
}

class DeveloperDialogNode extends GameNode {
  private developerDialog!: DeveloperDialog;

  constructor() {
    super({ name: 'ui.developerDialog', order: 30 });
  }

  init(ctx: NodeContext): void {
    this.developerDialog = new DeveloperDialog(ctx.phaserScene);
  }

  toggle(): void {
    this.developerDialog.toggle();
  }

  isOpen(): boolean {
    return this.developerDialog?.isOpen() ?? false;
  }

  destroy(): void {
    this.developerDialog?.destroy();
  }
}

class DebugPanelNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private debugPanel!: Phaser.GameObjects.Container;
  private collisionButton!: Phaser.GameObjects.Text;
  private developerButton!: Phaser.GameObjects.Text;
  private collisionDebugEnabled = false;

  constructor() {
    super({ name: 'ui.debugPanel', order: 40 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    const resolution = Math.max(2, window.devicePixelRatio || 1);
    const bg = this.phaserScene.add
      .rectangle(0, 0, 156, 86, 0x020617, 0.72)
      .setStrokeStyle(1, 0x38bdf8, 0.65)
      .setOrigin(1, 0)
      .setScrollFactor(0);

    const title = this.phaserScene.add.text(-144, 7, 'DEBUG', TEXT.small).setScrollFactor(0).setResolution(resolution);

    this.collisionButton = this.phaserScene.add
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
      .setResolution(resolution);

    this.collisionButton.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.preventDefault();
      pointer.event.stopPropagation();
      this.toggleCollisionDebug(this.phaserScene);
    });

    this.developerButton = this.phaserScene.add
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
      .setResolution(resolution);

    this.developerButton.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.preventDefault();
      pointer.event.stopPropagation();
      this.requireNode<DeveloperDialogNode>('ui.developerDialog').toggle();
    });

    this.debugPanel = this.phaserScene.add.container(0, 0, [bg, title, this.collisionButton, this.developerButton]).setDepth(UI_DEPTH + 40).setScrollFactor(0);
  }

  update(): void {
    this.debugPanel?.setPosition(this.phaserScene.scale.width - 12, 12);
  }

  containsPointer(pointer: Phaser.Input.Pointer): boolean {
    return pointer.x >= this.debugPanel.x - 156 && pointer.x <= this.debugPanel.x && pointer.y >= this.debugPanel.y && pointer.y <= this.debugPanel.y + 86;
  }

  destroy(): void {
    this.debugPanel?.destroy(true);
  }

  private toggleCollisionDebug(phaserScene: Phaser.Scene): void {
    this.collisionDebugEnabled = !this.collisionDebugEnabled;
    this.collisionButton.setText(`Collision: ${this.collisionDebugEnabled ? 'ON' : 'OFF'}`);
    this.collisionButton.setColor(this.collisionDebugEnabled ? '#86efac' : '#f8fafc');
    emitGameEvent(phaserScene, GAME_EVENTS.debugCollision, this.collisionDebugEnabled);
  }
}

class TouchControlsNode extends GameNode {
  private leftJoystick!: VirtualJoystick;
  private rightJoystick!: VirtualJoystick;
  private controlsHint!: Phaser.GameObjects.Text;
  private phaserScene!: Phaser.Scene;

  constructor() {
    super({ name: 'ui.touchControls', order: 50 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.phaserScene.input.addPointer(3);
    this.leftJoystick = new VirtualJoystick(this.phaserScene, 'left', 'MOVE');
    this.rightJoystick = new VirtualJoystick(this.phaserScene, 'right', 'LASER');
    this.controlsHint = this.phaserScene.add
      .text(0, 0, 'Mobile: linker Stick laufen/springen · rechter Stick zielen & minen', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        color: '#e2e8f0',
        backgroundColor: 'rgba(2,6,23,0.45)',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 40)
      .setResolution(Math.max(2, window.devicePixelRatio || 1));

    this.phaserScene.input.on('pointerdown', this.handlePointerDown, this);
    this.phaserScene.input.on('pointermove', this.handlePointerMove, this);
    this.phaserScene.input.on('pointerup', this.handlePointerUp, this);
    this.phaserScene.input.on('pointerupoutside', this.handlePointerUp, this);
  }

  update(): void {
    const inputMode = this.requireNode<GameplayUiScene>('ui.gameplay').getInputMode();
    const width = this.phaserScene.scale.width;
    const height = this.phaserScene.scale.height;
    const compact = height <= 430 || width <= 760;
    const touchMode = inputMode === 'touch';

    this.leftJoystick.layout();
    this.rightJoystick.layout();
    if (!touchMode) {
      this.leftJoystick.setVisible(false);
      this.rightJoystick.setVisible(false);
    }

    this.controlsHint
      .setPosition(width / 2, Math.max(24, height - 26))
      .setWordWrapWidth(Math.max(320, width - 48))
      .setVisible(!compact && touchMode);
  }

  getMoveVector(): Phaser.Math.Vector2 {
    return this.requireNode<GameplayUiScene>('ui.gameplay').getInputMode() === 'touch' ? this.leftJoystick.vector : Phaser.Math.Vector2.ZERO;
  }

  getAimVector(): Phaser.Math.Vector2 {
    return this.requireNode<GameplayUiScene>('ui.gameplay').getInputMode() === 'touch' ? this.rightJoystick.aim : Phaser.Math.Vector2.RIGHT;
  }

  isAiming(): boolean {
    return this.rightJoystick.active;
  }

  containsPointer(pointer: Phaser.Input.Pointer): boolean {
    return this.leftJoystick.contains(pointer) || this.rightJoystick.contains(pointer);
  }

  destroy(): void {
    this.phaserScene?.input.off('pointerdown', this.handlePointerDown, this);
    this.phaserScene?.input.off('pointermove', this.handlePointerMove, this);
    this.phaserScene?.input.off('pointerup', this.handlePointerUp, this);
    this.phaserScene?.input.off('pointerupoutside', this.handlePointerUp, this);
    this.controlsHint?.destroy();
    this.leftJoystick?.setVisible(false);
    this.rightJoystick?.setVisible(false);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.shouldHandlePointer(pointer)) return;
    const handled = pointer.x < this.phaserScene.scale.width / 2
      ? this.leftJoystick.handlePointerDown(pointer)
      : this.rightJoystick.handlePointerDown(pointer);
    if (handled) pointer.event.preventDefault();
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isTouchInputEnabled()) return;
    this.leftJoystick.handlePointerMove(pointer);
    this.rightJoystick.handlePointerMove(pointer);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.isTouchInputEnabled()) return;
    this.leftJoystick.handlePointerUp(pointer);
    this.rightJoystick.handlePointerUp(pointer);
  }

  private shouldHandlePointer(pointer: Phaser.Input.Pointer): boolean {
    return this.isTouchInputEnabled() && !this.requireNode<DebugPanelNode>('ui.debugPanel').containsPointer(pointer);
  }

  private isTouchInputEnabled(): boolean {
    const gameplayUi = this.requireNode<GameplayUiScene>('ui.gameplay');
    return gameplayUi.getInputMode() === 'touch' && !gameplayUi.isMenuOpen();
  }
}

function placeAtlasRegion(
  image: Phaser.GameObjects.Image,
  source: { x: number; y: number; w: number; h: number },
  x: number,
  y: number,
  scale: number,
): void {
  image
    .setPosition(x - source.x * scale, y - source.y * scale)
    .setCrop(source.x, source.y, source.w, source.h)
    .setScale(scale)
    .setVisible(true);
}

function placeAtlasBar(
  bar: Phaser.GameObjects.Image,
  source: { x: number; y: number; w: number; h: number },
  x: number,
  y: number,
  width: number,
  height: number,
  pct: number,
): void {
  const safePct = Phaser.Math.Clamp(pct, 0, 1);
  const cropWidth = Math.max(1, Math.round(source.w * safePct));
  const scaleX = width / source.w;
  const scaleY = height / source.h;

  bar
    .setPosition(x - source.x * scaleX, y - source.y * scaleY)
    .setCrop(source.x, source.y, cropWidth, source.h)
    .setScale(scaleX, scaleY)
    .setVisible(safePct > 0);
}
