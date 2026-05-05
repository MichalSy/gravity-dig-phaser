import Phaser from 'phaser';
import { HudStateNode } from '../../app/nodes';
import { GameNode, type NodeContext } from '../../nodes';
import { hudScaleForWidth, placeAtlasBar, placeAtlasRegion, TEXT, UI_ATLAS, UI_DEPTH } from './uiLayout';

export class BottomHudNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private hudState!: HudStateNode;
  private actionFrame!: Phaser.GameObjects.Image;
  private energyFill!: Phaser.GameObjects.Image;
  private readonly slotFrames: Phaser.GameObjects.Image[] = [];
  private readonly slotItems: Phaser.GameObjects.Image[] = [];
  private readonly slotLabels: Phaser.GameObjects.Text[] = [];
  override readonly dependencies = ['hudState'] as const;

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

  resolve(): void {
    this.hudState = this.requireNode<HudStateNode>('hudState');
  }

  update(): void {
    const state = this.hudState.getState();
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
