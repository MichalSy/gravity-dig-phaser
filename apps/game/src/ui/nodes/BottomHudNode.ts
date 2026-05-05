import Phaser from 'phaser';
import { HudStateNode } from '../../app/nodes';
import { GameNode, ImageNode, type NodeContext, type NodeDebugBounds, type NodeDebugProps } from '../../nodes';
import { computeBottomHudLayout, computeBottomHudSlotLayout } from '../layout/bottomHudLayout';
import { placeFrameBar, placeFrameRegion, TEXT, UI_ATLAS, UI_DEPTH } from './uiLayout';

export class BottomHudNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private hudState!: HudStateNode;
  private readonly actionFrameNode: ImageNode;
  private readonly energyFillNode: ImageNode;
  private readonly slotFrameNodes: ImageNode[] = [];
  private readonly slotItemNodes: ImageNode[] = [];
  private readonly slotLabels: Phaser.GameObjects.Text[] = [];
  override readonly dependencies = ['hudState'] as const;

  constructor() {
    super({ name: 'ui.bottomHud', order: 10, className: 'BottomHudNode' });
    this.actionFrameNode = this.addChild(new ImageNode({ name: 'ui.actionFrame', assetId: 'hud-hp-fuel-atlas#bottomHud', order: 0, depth: UI_DEPTH + 11.1, scrollFactor: 0, syncMode: 'object-to-node' }));
    this.energyFillNode = this.addChild(new ImageNode({ name: 'ui.energyFill', assetId: 'hud-hp-fuel-atlas#energyBar', order: 10, depth: UI_DEPTH + 11.2, scrollFactor: 0, syncMode: 'object-to-node' }));

    for (let i = 0; i < 4; i += 1) {
      this.slotFrameNodes.push(this.addChild(new ImageNode({ name: `ui.slotFrame${i}`, assetId: 'hud-hp-fuel-atlas#repeatSlot', order: 20 + i, visible: false, depth: UI_DEPTH + 10.8, scrollFactor: 0, syncMode: 'object-to-node' })));
      this.slotItemNodes.push(this.addChild(new ImageNode({ name: `ui.slotItem${i}`, assetId: 'hud-item-rock', order: 30 + i, anchor: 'center', visible: false, depth: UI_DEPTH + 12, scrollFactor: 0, syncMode: 'object-to-node' })));
    }
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    const resolution = Math.max(2, window.devicePixelRatio || 1);

    for (let i = 0; i < 4; i += 1) {
      this.slotLabels.push(this.phaserScene.add.text(0, 0, '', TEXT.value).setOrigin(1, 1).setScrollFactor(0).setDepth(UI_DEPTH + 12).setResolution(resolution));
    }
  }

  resolve(): void {
    this.hudState = this.requireNode<HudStateNode>('hudState');
  }

  override getDebugBounds(): NodeDebugBounds | undefined {
    return this.actionFrameNode.getDebugBounds();
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

    placeFrameRegion(this.actionFrameNode.image, layout.x, layout.dockY, layout.atlasScale);
    placeFrameBar(this.energyFillNode.image, UI_ATLAS.energyBar, layout.energy.x, layout.energy.y, layout.energy.w, layout.energy.h, layout.energyPct);

    for (let i = 0; i < this.slotLabels.length; i += 1) {
      const label = this.slotLabels[i];
      const frame = this.slotFrameNodes[i].image;
      const item = this.slotItemNodes[i].image;
      const slot = state.cargo.slots[i];
      const slotLayout = computeBottomHudSlotLayout(layout, state, i);

      if (slotLayout.isExtraSlot) {
        frame.setDepth(UI_DEPTH + slotLayout.frameDepth);
        placeFrameRegion(frame, slotLayout.frameX, slotLayout.frameY, layout.slotScale);
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
    for (const object of this.slotLabels) object.destroy();
    this.slotLabels.length = 0;
  }
}
