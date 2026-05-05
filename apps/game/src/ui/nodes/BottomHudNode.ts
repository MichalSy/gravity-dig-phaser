import Phaser from 'phaser';
import { HudStateNode } from '../../app/nodes';
import { GameNode, ImageNode, type NodeContext, type NodeDebugProps } from '../../nodes';
import { computeBottomHudLayout, computeBottomHudSlotLayout } from '../layout/bottomHudLayout';
import { hudScaleForWidth, TEXT, UI_ATLAS, UI_DEPTH } from './uiLayout';

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
    super({ name: 'ui.bottomHud', order: 10, className: 'BottomHudNode', anchor: 'bottom-center', parentAnchor: 'bottom-center', sizeMode: 'explicit' });
    this.actionFrameNode = this.addChild(new ImageNode({ name: 'ui.actionFrame', assetId: 'hud-hp-fuel-atlas#bottomHud', order: 0, depth: UI_DEPTH + 11.1, scrollFactor: 0 }));
    this.energyFillNode = this.addChild(new ImageNode({ name: 'ui.energyFill', assetId: 'hud-hp-fuel-atlas#energyBar', order: 10, depth: UI_DEPTH + 11.2, scrollFactor: 0 }));

    for (let i = 0; i < 4; i += 1) {
      this.slotFrameNodes.push(this.addChild(new ImageNode({ name: `ui.slotFrame${i}`, assetId: 'hud-hp-fuel-atlas#repeatSlot', order: 20 + i, visible: false, depth: UI_DEPTH + 10.8, scrollFactor: 0 })));
      this.slotItemNodes.push(this.addChild(new ImageNode({ name: `ui.slotItem${i}`, assetId: 'hud-item-rock', order: 30 + i, anchor: 'center', visible: false, depth: UI_DEPTH + 12, scrollFactor: 0 })));
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

    const viewportWidth = this.phaserScene.scale.width;
    const viewportHeight = this.phaserScene.scale.height;
    const layout = computeBottomHudLayout(viewportWidth, viewportHeight, state);
    const scale = hudScaleForWidth(viewportWidth);
    const margin = 10 * scale;
    const frameWidth = (UI_ATLAS.bottomHud.w + layout.extraSlotCount * UI_ATLAS.repeatSlotStep) * layout.atlasScale;
    const frameHeight = UI_ATLAS.bottomHud.h * layout.atlasScale;
    const worldAnchorX = viewportWidth / 2;
    const worldAnchorY = viewportHeight - margin;

    this.position = { x: 0, y: -margin };
    this.size = { width: frameWidth, height: frameHeight };

    this.placeRegionNode(this.actionFrameNode, layout.x - worldAnchorX, layout.dockY - worldAnchorY, layout.atlasScale);
    this.placeBarNode(this.energyFillNode, UI_ATLAS.energyBar, layout.energy.x - worldAnchorX, layout.energy.y - worldAnchorY, layout.energy.w, layout.energy.h, layout.energyPct);

    for (let i = 0; i < this.slotLabels.length; i += 1) {
      const label = this.slotLabels[i];
      const frame = this.slotFrameNodes[i].image;
      const item = this.slotItemNodes[i].image;
      const slot = state.cargo.slots[i];
      const slotLayout = computeBottomHudSlotLayout(layout, state, i);

      if (slotLayout.isExtraSlot) {
        this.slotFrameNodes[i].depth = UI_DEPTH + slotLayout.frameDepth;
        this.placeRegionNode(this.slotFrameNodes[i], slotLayout.frameX - worldAnchorX, slotLayout.frameY - worldAnchorY, layout.slotScale);
      } else {
        this.slotFrameNodes[i].visible = false;
        frame.setVisible(false);
      }

      this.slotItemNodes[i].position = { x: slotLayout.itemX - worldAnchorX, y: slotLayout.itemY - worldAnchorY };
      this.slotItemNodes[i].size = { width: slotLayout.itemSize, height: slotLayout.itemSize };
      this.slotItemNodes[i].scaleX = slotLayout.itemSize / item.frame.width;
      this.slotItemNodes[i].scaleY = slotLayout.itemSize / item.frame.height;
      this.slotItemNodes[i].visible = slotLayout.hasItem;
      item.setVisible(slotLayout.hasItem);

      label.setVisible(slotLayout.hasItem);
      if (slotLayout.hasItem) {
        label
          .setText(`x${slot?.quantity ?? 0}`)
          .setPosition(slotLayout.labelX, slotLayout.labelY)
          .setScale(slotLayout.labelScale);
      }
    }
  }

  private placeRegionNode(node: ImageNode, x: number, y: number, scale: number): void {
    node.position = { x, y };
    node.scale = scale;
    node.scaleX = scale;
    node.scaleY = scale;
    node.size = { width: node.image.frame.width * Math.abs(scale), height: node.image.frame.height * Math.abs(scale) };
    node.visible = true;
    node.image.setCrop().setVisible(true);
  }

  private placeBarNode(node: ImageNode, frame: { w: number; h: number }, x: number, y: number, width: number, height: number, pct: number): void {
    const safePct = Phaser.Math.Clamp(pct, 0, 1);
    const cropWidth = Math.max(1, Math.round(frame.w * safePct));
    node.position = { x, y };
    node.scaleX = width / frame.w;
    node.scaleY = height / frame.h;
    node.size = { width, height };
    node.visible = safePct > 0;
    node.image.setCrop(0, 0, cropWidth, frame.h).setVisible(safePct > 0);
  }

  destroy(): void {
    for (const object of this.slotLabels) object.destroy();
    this.slotLabels.length = 0;
  }
}
