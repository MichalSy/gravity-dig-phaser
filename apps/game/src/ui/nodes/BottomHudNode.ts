import Phaser from 'phaser';
import { HudStateNode } from '../../app/nodes';
import { exposedPropGroup, GameNode, ImageNode, SceneNodeFactoryRegistry, TextNode, type ExposedPropGroup, type GameNodeOptions, type NodeContext, type NodeDebugProps, type SceneFileJson } from '../../nodes';
import { computeBottomHudLayout, computeBottomHudSlotLayout } from '../layout/bottomHudLayout';
import bottomHudSceneJson from './bottomHud.scene.json';
import { TEXT, UI_ATLAS, UI_DEPTH } from './uiLayout';

const bottomHudScene = bottomHudSceneJson as SceneFileJson;
const bottomHudNodeRegistry = new SceneNodeFactoryRegistry()
  .registerImage('af9fee4b-158b-4ead-8264-c46e5d7af366')
  .registerImage('470d2d11-1ada-4bac-9d20-fde438408424')
  .registerImage('ac806217-66e0-4a83-8ccd-7891b49e9843')
  .registerImage('8f51a2f7-b2a6-4291-8168-87f69cd52fc8')
  .registerImage('f11d3a50-62c5-46bc-8d38-aef480dac284')
  .registerImage('bd6775ad-9138-4255-bcd9-1b1075cacaf0')
  .registerImage('38b37c84-8e23-4916-a9e2-73fddf87e35d')
  .registerImage('06460d2b-6c62-4d6a-b848-0a7f80df73f1')
  .registerImage('4b54d317-4b8d-46f5-90d6-214358c4d188')
  .registerImage('65cd6cb1-6dc7-4937-80af-315cdd92c12e')
  .registerText('966e64da-3cd8-47e0-b74b-9cc28b4bb246')
  .registerText('9ba299e0-b2ce-4973-b3d4-38c0faeec8b0')
  .registerText('1e1504a9-96f5-45b2-be68-c69eed3bdb1c')
  .registerText('80bd70f5-c17b-4058-8b77-2acfc2087e53');

export class BottomHudNode extends GameNode {
  static override readonly sceneType: string = 'BottomHudNode';
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    exposedPropGroup('State', {
      active: GameNode.exposedPropGroups[0].props.active,
      visible: GameNode.exposedPropGroups[0].props.visible,
    }),
    exposedPropGroup('Layout', {
      parentAnchor: GameNode.exposedPropGroups[1].props.parentAnchor,
    }),
  ];

  private phaserScene!: Phaser.Scene;
  private hudState!: HudStateNode;
  private readonly actionFrameNode: ImageNode;
  private readonly energyFillNode: ImageNode;
  private readonly slotFrameNodes: ImageNode[] = [];
  private readonly slotItemNodes: ImageNode[] = [];
  private readonly slotLabelNodes: TextNode[] = [];
  override readonly dependencies = ['hudState'] as const;

  constructor() {
    super({ guid: bottomHudScene.root.id, name: bottomHudScene.root.name, className: 'BottomHudNode', sizeMode: 'explicit', debugScrollFactor: 0, ...(bottomHudScene.root.props as GameNodeOptions | undefined) });

    const nodesByName = new Map<string, GameNode>();
    for (const childDefinition of bottomHudScene.root.children ?? []) {
      const child = this.addChild(bottomHudNodeRegistry.createTree(childDefinition));
      collectNodesByName(child, nodesByName);
    }

    this.actionFrameNode = requireSceneNode<ImageNode>(nodesByName, 'ui.actionFrame');
    this.energyFillNode = requireSceneNode<ImageNode>(nodesByName, 'ui.energyFill');

    for (let i = 0; i < 4; i += 1) {
      const slotFrameNode = requireSceneNode<ImageNode>(nodesByName, `ui.slotFrame${i}`);
      const slotItemNode = requireSceneNode<ImageNode>(nodesByName, `ui.slotItem${i}`);
      const slotLabelNode = requireSceneNode<TextNode>(nodesByName, `ui.slotLabel${i}`);
      slotLabelNode.style = TEXT.value;
      this.slotFrameNodes.push(slotFrameNode);
      this.slotItemNodes.push(slotItemNode);
      this.slotLabelNodes.push(slotLabelNode);
    }

    this.markHudComputedPropsReadOnly();
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

      const slotFrameNode = this.slotFrameNodes[i];
      slotFrameNode.depth = UI_DEPTH + slotLayout.frameDepth;
      this.placeRegionNode(slotFrameNode, slotLayout.frameX - frameX, i === 1 ? slotFrameNode.position.y : slotLayout.frameY - frameY, layout.slotScale, slotLayout.isExtraSlot);

      const itemParentScaleX = i === 1 ? Math.abs(this.slotFrameNodes[i].scaleX) : 1;
      const itemParentScaleY = i === 1 ? Math.abs(this.slotFrameNodes[i].scaleY) : 1;
      const itemWidth = slotLayout.itemSize / Math.max(itemParentScaleX, Number.EPSILON);
      const itemHeight = slotLayout.itemSize / Math.max(itemParentScaleY, Number.EPSILON);
      const slotItemNode = this.slotItemNodes[i];
      if (i !== 1) slotItemNode.position = { x: slotLayout.itemX - frameX, y: slotLayout.itemY - frameY };
      slotItemNode.size = { width: itemWidth, height: itemHeight };
      slotItemNode.scaleX = itemWidth / item.frame.width;
      slotItemNode.scaleY = itemHeight / item.frame.height;
      slotItemNode.visible = slotLayout.hasItem;
      item.setVisible(slotItemNode.visible);

      const labelParentScaleX = i === 1 ? Math.abs(this.slotFrameNodes[i].scaleX) : 1;
      const labelParentScaleY = i === 1 ? Math.abs(this.slotFrameNodes[i].scaleY) : 1;
      const labelScaleX = slotLayout.labelScale / Math.max(labelParentScaleX, Number.EPSILON);
      const labelScaleY = slotLayout.labelScale / Math.max(labelParentScaleY, Number.EPSILON);
      labelNode.visible = slotLayout.hasItem;
      labelNode.text = `x${slot?.quantity ?? 0}`;
      if (i !== 1) labelNode.position = { x: slotLayout.labelX - frameX, y: slotLayout.labelY - frameY };
      labelNode.scale = labelScaleX;
      labelNode.scaleX = labelScaleX;
      labelNode.scaleY = labelScaleY;
    }
  }

  private markHudComputedPropsReadOnly(): void {
    const computedByHudLayout = 'computed by BottomHudNode.update';
    for (const node of [this.actionFrameNode, this.energyFillNode]) {
      for (const prop of ['position', 'size', 'scale', 'visible']) node.markExposedPropReadOnly(prop, computedByHudLayout);
    }
    for (let i = 0; i < this.slotFrameNodes.length; i += 1) {
      const frameNode = this.slotFrameNodes[i];
      for (const prop of ['size', 'scale', 'visible']) frameNode.markExposedPropReadOnly(prop, computedByHudLayout);
      if (i !== 1) frameNode.markExposedPropReadOnly('position', computedByHudLayout);

      const itemNode = this.slotItemNodes[i];
      for (const prop of ['size', 'scale', 'visible']) itemNode.markExposedPropReadOnly(prop, computedByHudLayout);
      if (i !== 1) itemNode.markExposedPropReadOnly('position', computedByHudLayout);

      const labelNode = this.slotLabelNodes[i];
      for (const prop of ['visible', 'text', 'scale']) labelNode.markExposedPropReadOnly(prop, computedByHudLayout);
      if (i !== 1) labelNode.markExposedPropReadOnly('position', computedByHudLayout);
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

function collectNodesByName(node: GameNode, nodesByName: Map<string, GameNode>): void {
  if (node.name) nodesByName.set(node.name, node);
  for (const child of node.children) collectNodesByName(child, nodesByName);
}

function requireSceneNode<T extends GameNode>(nodesByName: ReadonlyMap<string, GameNode>, name: string): T {
  const node = nodesByName.get(name);
  if (!node) throw new Error(`Bottom HUD scene is missing node '${name}'`);
  return node as T;
}
