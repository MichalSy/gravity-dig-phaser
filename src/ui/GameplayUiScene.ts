import Phaser from 'phaser';
import { GameNode, NodeScene, type NodeContext, type RenderContext } from '../nodes';
import type { HudState } from './HudState';

interface HudTextStyle extends Phaser.Types.GameObjects.Text.TextStyle {
  fontFamily: string;
  fontSize: string;
  color: string;
}

const TEXT = {
  value: { fontFamily: 'Arial, sans-serif', fontSize: '15px', fontStyle: '800', color: '#f8fafc' } satisfies HudTextStyle,
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

export function hudScaleForWidth(width: number): number {
  return Phaser.Math.Clamp(width / 1280, 0.5, 1);
}

export function bottomHudDisplayHeight(width: number): number {
  return UI_ATLAS.bottomDisplayHeight * hudScaleForWidth(width);
}

export class GameplayUiScene extends NodeScene {
  private hudState?: HudState;

  constructor() {
    super({ sceneName: 'ui.gameplay', order: 100 });
    this.addChild(new StatusHudNode());
    this.addChild(new BottomHudNode());
  }

  setHudState(state: HudState): void {
    this.hudState = state;
  }

  getHudState(): HudState | undefined {
    return this.hudState;
  }
}

class StatusHudNode extends GameNode {
  private statusFrame!: Phaser.GameObjects.Image;
  private hpFill!: Phaser.GameObjects.Image;
  private fuelFill!: Phaser.GameObjects.Image;

  constructor() {
    super({ name: 'ui.statusHud', order: 0 });
  }

  init(ctx: NodeContext): void {
    this.statusFrame = ctx.phaserScene.add.image(0, 0, 'hud-hp-fuel-atlas').setOrigin(0, 0).setScrollFactor(0).setDepth(10);
    this.hpFill = ctx.phaserScene.add.image(0, 0, 'hud-hp-fuel-atlas').setOrigin(0, 0).setScrollFactor(0).setDepth(11);
    this.fuelFill = ctx.phaserScene.add.image(0, 0, 'hud-hp-fuel-atlas').setOrigin(0, 0).setScrollFactor(0).setDepth(11);
  }

  render(ctx: RenderContext): void {
    const state = this.requireNode<GameplayUiScene>('ui.gameplay').getHudState();
    if (!state) return;

    const x = 18;
    const y = 18;
    const scale = hudScaleForWidth(ctx.phaserScene.scale.width);
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
  private actionFrame!: Phaser.GameObjects.Image;
  private energyFill!: Phaser.GameObjects.Image;
  private readonly slotFrames: Phaser.GameObjects.Image[] = [];
  private readonly slotItems: Phaser.GameObjects.Image[] = [];
  private readonly slotLabels: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ name: 'ui.bottomHud', order: 10 });
  }

  init(ctx: NodeContext): void {
    const resolution = Math.max(2, window.devicePixelRatio || 1);
    this.actionFrame = ctx.phaserScene.add.image(0, 0, 'hud-hp-fuel-atlas').setOrigin(0, 0).setScrollFactor(0).setDepth(11.1);
    this.energyFill = ctx.phaserScene.add.image(0, 0, 'hud-hp-fuel-atlas').setOrigin(0, 0).setScrollFactor(0).setDepth(11.2);

    for (let i = 0; i < 4; i += 1) {
      this.slotFrames.push(ctx.phaserScene.add.image(0, 0, 'hud-hp-fuel-atlas').setOrigin(0, 0).setScrollFactor(0).setDepth(10.8).setVisible(false));
      this.slotItems.push(ctx.phaserScene.add.image(0, 0, 'hud-item-rock').setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(12).setVisible(false));
      this.slotLabels.push(ctx.phaserScene.add.text(0, 0, '', TEXT.value).setOrigin(1, 1).setScrollFactor(0).setDepth(12).setResolution(resolution));
    }
  }

  render(ctx: RenderContext): void {
    const state = this.requireNode<GameplayUiScene>('ui.gameplay').getHudState();
    if (!state) return;

    const scale = hudScaleForWidth(ctx.phaserScene.scale.width);
    const atlasScale = (UI_ATLAS.bottomDisplayHeight * scale) / UI_ATLAS.bottomHud.h;
    const extraSlotCount = Math.max(0, Math.min(this.slotFrames.length - 1, state.cargo.visibleSlots - 1));
    const frameW = (UI_ATLAS.bottomHud.w + extraSlotCount * UI_ATLAS.repeatSlotStep) * atlasScale;
    const x = ctx.phaserScene.scale.width / 2 - frameW / 2;
    const dockY = ctx.phaserScene.scale.height - UI_ATLAS.bottomHud.h * atlasScale - 10 * scale;
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
        frame.setDepth(10.8 + (extraSlotCount - i) * 0.01);
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
