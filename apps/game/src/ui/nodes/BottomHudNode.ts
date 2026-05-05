import Phaser from 'phaser';
import { HudStateNode } from '../../app/nodes';
import { GameNode, type NodeContext, type NodeDebugBounds, type NodeDebugProps } from '../../nodes';
import { computeBottomHudLayout, computeBottomHudSlotLayout } from '../layout/bottomHudLayout';
import { placeAtlasBar, placeAtlasRegion, TEXT, UI_ATLAS, UI_DEPTH } from './uiLayout';

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
    super({ name: 'ui.bottomHud', order: 10, className: 'BottomHudNode' });
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

  override getDebugBounds(): NodeDebugBounds | undefined {
    const bounds = this.actionFrame?.getBounds();
    if (!bounds) return undefined;
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, scrollFactor: 0 };
  }

  override getDebugProps(): NodeDebugProps {
    const state = this.hudState?.getState();
    return {
      ...super.getDebugProps(),
      energy: state ? Math.round(state.energy.current) : null,
      cargoSlots: state?.cargo.slots.length ?? null,
    };
  }

  update(): void {
    const state = this.hudState.getState();
    if (!state) return;

    const layout = computeBottomHudLayout(this.phaserScene.scale.width, this.phaserScene.scale.height, state);

    placeAtlasRegion(this.actionFrame, UI_ATLAS.bottomHud, layout.x, layout.dockY, layout.atlasScale);
    placeAtlasBar(
      this.energyFill,
      UI_ATLAS.energyBar,
      layout.energy.x,
      layout.energy.y,
      layout.energy.w,
      layout.energy.h,
      layout.energyPct,
    );

    for (let i = 0; i < this.slotLabels.length; i += 1) {
      const label = this.slotLabels[i];
      const frame = this.slotFrames[i];
      const item = this.slotItems[i];
      const slot = state.cargo.slots[i];
      const slotLayout = computeBottomHudSlotLayout(layout, state, i);

      if (slotLayout.isExtraSlot) {
        frame.setDepth(UI_DEPTH + slotLayout.frameDepth);
        placeAtlasRegion(frame, UI_ATLAS.repeatSlot, slotLayout.frameX, slotLayout.frameY, layout.slotScale);
      } else {
        frame.setVisible(false);
      }

      item
        .setPosition(slotLayout.itemX, slotLayout.itemY)
        .setDisplaySize(slotLayout.itemSize, slotLayout.itemSize)
        .setVisible(slotLayout.hasItem);

      label.setVisible(slotLayout.hasItem);
      if (slotLayout.hasItem) {
        label
          .setText(`x${slot?.quantity ?? 0}`)
          .setPosition(slotLayout.labelX, slotLayout.labelY)
          .setScale(slotLayout.labelScale);
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
