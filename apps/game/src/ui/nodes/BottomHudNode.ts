import Phaser from 'phaser';
import { HudStateNode } from '../../app/nodes';
import { GameNode, ImageNode, TextNode, type NodeContext, type NodeDebugProps } from '../../nodes';
import { computeBottomHudLayout, computeBottomHudSlotLayout } from '../layout/bottomHudLayout';
import { TEXT, UI_ATLAS, UI_DEPTH } from './uiLayout';

export class BottomHudNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private hudState!: HudStateNode;
  private readonly actionFrameNode: ImageNode;
  private readonly energyFillNode: ImageNode;
  private readonly slotFrameNodes: ImageNode[] = [];
  private readonly slotItemNodes: ImageNode[] = [];
  private readonly slotLabelNodes: TextNode[] = [];
  override readonly dependencies = ['hudState'] as const;

  constructor() {
    super({ name: 'ui.bottomHud', order: 10, className: 'BottomHudNode', anchor: 'bottom-left', parentAnchor: 'bottom-center', sizeMode: 'explicit', debugScrollFactor: 0 });
    this.actionFrameNode = this.addChild(new ImageNode({ name: 'ui.actionFrame', assetId: 'hud-hp-fuel-atlas#bottomHud', order: 0, depth: UI_DEPTH + 11.1, scrollFactor: 0 }));
    this.energyFillNode = this.addChild(new ImageNode({ name: 'ui.energyFill', assetId: 'hud-hp-fuel-atlas#energyBar', order: 10, depth: UI_DEPTH + 11.2, scrollFactor: 0 }));

    for (let i = 0; i < 4; i += 1) {
      const slotFrameNode = this.addChild(new ImageNode({ name: `ui.slotFrame${i}`, assetId: 'hud-hp-fuel-atlas#repeatSlot', order: 20 + i, anchor: i === 1 ? 'center-left' : 'top-left', parentAnchor: i === 1 ? 'center-left' : 'top-left', visible: false, depth: UI_DEPTH + 10.8, scrollFactor: 0 }));
      const slotItemNode = new ImageNode({ name: `ui.slotItem${i}`, assetId: 'hud-item-rock', order: 30 + i, anchor: 'center', parentAnchor: i === 1 ? 'center' : 'top-left', visible: false, depth: UI_DEPTH + 12, scrollFactor: 0 });
      const slotLabelNode = new TextNode({ name: `ui.slotLabel${i}`, text: '', style: TEXT.value, order: 40 + i, anchor: 'bottom-right', parentAnchor: i === 1 ? 'bottom-right' : 'top-left', visible: false, depth: UI_DEPTH + 12, scrollFactor: 0 });
      this.slotFrameNodes.push(slotFrameNode);
      this.slotItemNodes.push(i === 1 ? slotFrameNode.addChild(slotItemNode) : this.addChild(slotItemNode));
      this.slotLabelNodes.push(i === 1 ? slotFrameNode.addChild(slotLabelNode) : this.addChild(slotLabelNode));
    }
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    const resolution = Math.max(2, window.devicePixelRatio || 1);
    for (const labelNode of this.slotLabelNodes) labelNode.resolution = resolution;
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
    const frameWidth = (UI_ATLAS.bottomHud.w + layout.extraSlotCount * UI_ATLAS.repeatSlotStep) * layout.atlasScale;
    const frameHeight = UI_ATLAS.bottomHud.h * layout.atlasScale;
    const frameX = layout.x;
    const frameY = layout.dockY;

    this.position = { x: -frameWidth / 2, y: 0 };
    this.size = { width: frameWidth, height: frameHeight };

    this.placeRegionNode(this.actionFrameNode, 0, 0, layout.atlasScale);
    this.placeBarNode(this.energyFillNode, UI_ATLAS.energyBar, layout.energy.x - frameX, layout.energy.y - frameY, layout.energy.w, layout.energy.h, layout.energyPct);

    for (let i = 0; i < this.slotLabelNodes.length; i += 1) {
      const labelNode = this.slotLabelNodes[i];
      const item = this.slotItemNodes[i].image;
      const slot = state.cargo.slots[i];
      const slotLayout = computeBottomHudSlotLayout(layout, state, i);

      this.slotFrameNodes[i].depth = UI_DEPTH + slotLayout.frameDepth;
      this.placeRegionNode(this.slotFrameNodes[i], slotLayout.frameX - frameX, i === 1 ? 0 : slotLayout.frameY - frameY, layout.slotScale, slotLayout.isExtraSlot);

      const itemParentScaleX = i === 1 ? Math.abs(this.slotFrameNodes[i].scaleX) : 1;
      const itemParentScaleY = i === 1 ? Math.abs(this.slotFrameNodes[i].scaleY) : 1;
      const itemWidth = slotLayout.itemSize / Math.max(itemParentScaleX, Number.EPSILON);
      const itemHeight = slotLayout.itemSize / Math.max(itemParentScaleY, Number.EPSILON);
      this.slotItemNodes[i].position = i === 1 ? { x: 0, y: 0 } : { x: slotLayout.itemX - frameX, y: slotLayout.itemY - frameY };
      this.slotItemNodes[i].size = { width: itemWidth, height: itemHeight };
      this.slotItemNodes[i].scaleX = itemWidth / item.frame.width;
      this.slotItemNodes[i].scaleY = itemHeight / item.frame.height;
      this.slotItemNodes[i].visible = slotLayout.hasItem;
      item.setVisible(slotLayout.hasItem);

      const labelParentScaleX = i === 1 ? Math.abs(this.slotFrameNodes[i].scaleX) : 1;
      const labelParentScaleY = i === 1 ? Math.abs(this.slotFrameNodes[i].scaleY) : 1;
      const labelScaleX = slotLayout.labelScale / Math.max(labelParentScaleX, Number.EPSILON);
      const labelScaleY = slotLayout.labelScale / Math.max(labelParentScaleY, Number.EPSILON);
      labelNode.visible = slotLayout.hasItem;
      labelNode.text = `x${slot?.quantity ?? 0}`;
      labelNode.position = i === 1 ? { x: -50, y: -50 } : { x: slotLayout.labelX - frameX, y: slotLayout.labelY - frameY };
      labelNode.scale = labelScaleX;
      labelNode.scaleX = labelScaleX;
      labelNode.scaleY = labelScaleY;
    }
  }

  private placeRegionNode(node: ImageNode, x: number, y: number, scale: number, visible = true): void {
    node.position = { x, y };
    node.scale = scale;
    node.scaleX = scale;
    node.scaleY = scale;
    node.size = { width: node.image.frame.width, height: node.image.frame.height };
    node.visible = visible;
    node.image.setCrop().setVisible(visible);
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

}
