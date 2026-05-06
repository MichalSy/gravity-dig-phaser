import Phaser from 'phaser';
import { GameplayInputNode } from '../../app/nodes';
import { buildHudState } from '../../game/gameplayLogic';
import { GameWorldNode, PlayerStateManagerNode } from '../../game/nodes';
import { collectNodesByName, exposedPropGroup, flattenExposedPropGroups, GameNode, ImageNode, TextNode, TransformNode, type ExposedPropGroup, type NodeContext, type NodeDebugProps, type TransformNodeOptions } from '../../nodes';
import { computeBottomHudLayout, computeBottomHudSlotLayout } from '../layout/bottomHudLayout';
import { TEXT, UI_ATLAS } from './uiLayout';

const gameNodeProps = flattenExposedPropGroups(GameNode.exposedPropGroups);
const transformNodeProps = flattenExposedPropGroups(TransformNode.exposedPropGroups);

export class BottomHudNode extends TransformNode {
  static override readonly sceneType: string = 'BottomHudNode';
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    exposedPropGroup('State', {
      active: gameNodeProps.active,
      visible: transformNodeProps.visible,
    }),
    exposedPropGroup('Layout', {
      parentAnchor: transformNodeProps.parentAnchor,
    }),
  ];

  private phaserScene!: Phaser.Scene;
  private world!: GameWorldNode;
  private playerState!: PlayerStateManagerNode;
  private gameplayInput!: GameplayInputNode;
  private actionFrameNode!: ImageNode;
  private energyFillNode!: ImageNode;
  private readonly slotFrameNodes: ImageNode[] = [];
  private readonly slotItemNodes: ImageNode[] = [];
  private readonly slotLabelNodes: TextNode[] = [];
  override readonly dependencies = ['World', 'PlayerState', 'GameplayInput'] as const;

  constructor(options: TransformNodeOptions = {}) {
    super({ name: 'UI.BottomHud', className: 'BottomHudNode', parentAnchor: 'bottom-center', origin: { x: 0, y: 1 }, sizeMode: 'explicit', debugScrollFactor: 0, ...options });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('World');
    this.playerState = this.requireNode<PlayerStateManagerNode>('PlayerState');
    this.gameplayInput = this.requireNode<GameplayInputNode>('GameplayInput');
    this.resolveChildNodes();
  }

  afterResolved(): void {
    this.configureSlotLabels();
    this.markHudComputedPropsReadOnly();
  }

  override getDebugProps(): NodeDebugProps {
    const state = this.getHudState();
    return {
      ...super.getDebugProps(),
      energy: state ? Math.round(state.energy.current) : null,
      cargoSlots: state?.cargo.slots.length ?? null,
    };
  }

  update(): void {
    const state = this.getHudState();

    const viewportWidth = this.phaserScene.scale.width;
    const viewportHeight = this.phaserScene.scale.height;
    const layout = computeBottomHudLayout(viewportWidth, viewportHeight, state);
    const frameWidth = layout.totalWidth;
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
      this.placeRegionNode(slotFrameNode, slotLayout.frameX - frameX, slotLayout.frameY - frameY, layout.slotScale, slotLayout.active);

      const itemParentScaleX = 1;
      const itemParentScaleY = 1;
      const itemWidth = slotLayout.itemSize / Math.max(itemParentScaleX, Number.EPSILON);
      const itemHeight = slotLayout.itemSize / Math.max(itemParentScaleY, Number.EPSILON);
      const slotItemNode = this.slotItemNodes[i];
      if (slotItemNode.isEffectivelyActive()) {
        slotItemNode.position = { x: slotLayout.itemX - frameX, y: slotLayout.itemY - frameY };
        slotItemNode.size = { width: itemWidth, height: itemHeight };
        slotItemNode.scaleX = itemWidth / item.frame.width;
        slotItemNode.scaleY = itemHeight / item.frame.height;
        slotItemNode.visible = slotLayout.hasItem;
        item.setVisible(slotItemNode.visible);
      }

      const labelParentScaleX = 1;
      const labelParentScaleY = 1;
      const labelScaleX = slotLayout.labelScale / Math.max(labelParentScaleX, Number.EPSILON);
      const labelScaleY = slotLayout.labelScale / Math.max(labelParentScaleY, Number.EPSILON);
      if (labelNode.isEffectivelyActive()) {
        labelNode.visible = slotLayout.hasItem;
        labelNode.text = `x${slot?.quantity ?? 0}`;
        labelNode.position = { x: slotLayout.labelX - frameX, y: slotLayout.labelY - frameY };
        labelNode.scale = labelScaleX;
        labelNode.scaleX = labelScaleX;
        labelNode.scaleY = labelScaleY;
      }
    }
  }

  private resolveChildNodes(): void {
    const nodesByName = collectNodesByName(this);
    this.actionFrameNode = requireSceneNode<ImageNode>(nodesByName, 'UI.ActionFrame');
    this.energyFillNode = requireSceneNode<ImageNode>(nodesByName, 'UI.EnergyFill');

    this.slotFrameNodes.length = 0;
    this.slotItemNodes.length = 0;
    this.slotLabelNodes.length = 0;

    for (let i = 0; i < 4; i += 1) {
      const slotFrameNode = requireSceneNode<ImageNode>(nodesByName, `UI.SlotFrame${i}`);
      const slotItemNode = requireSceneNode<ImageNode>(nodesByName, `UI.SlotItem${i}`);
      const slotLabelNode = requireSceneNode<TextNode>(nodesByName, `UI.SlotLabel${i}`);
      this.slotFrameNodes.push(slotFrameNode);
      this.slotItemNodes.push(slotItemNode);
      this.slotLabelNodes.push(slotLabelNode);
    }
  }

  private configureSlotLabels(): void {
    const resolution = Math.max(2, window.devicePixelRatio || 1);
    for (const labelNode of this.slotLabelNodes) {
      labelNode.setStyle(TEXT.value);
      labelNode.resolution = resolution;
    }
  }

  private getHudState() {
    return buildHudState({
      level: this.world.level,
      inputMode: this.gameplayInput.getInputMode(),
      playerState: this.playerState,
    });
  }

  private markHudComputedPropsReadOnly(): void {
    const computedByHudLayout = 'computed by BottomHudNode.update';
    for (const node of [this.actionFrameNode, this.energyFillNode]) {
      for (const prop of ['position', 'size', 'scale', 'visible']) node.markExposedPropReadOnly(prop, computedByHudLayout);
    }
    for (let i = 0; i < this.slotFrameNodes.length; i += 1) {
      const frameNode = this.slotFrameNodes[i];
      for (const prop of ['position', 'size', 'scale', 'visible']) frameNode.markExposedPropReadOnly(prop, computedByHudLayout);

      const itemNode = this.slotItemNodes[i];
      for (const prop of ['position', 'size', 'scale', 'visible']) itemNode.markExposedPropReadOnly(prop, computedByHudLayout);

      const labelNode = this.slotLabelNodes[i];
      for (const prop of ['position', 'visible', 'text', 'scale']) labelNode.markExposedPropReadOnly(prop, computedByHudLayout);
    }
  }

  private placeRegionNode(node: ImageNode, x: number, y: number, scale: number, visible = true): void {
    if (!node.isEffectivelyActive()) return;
    node.position = { x, y };
    node.scale = scale;
    node.scaleX = scale;
    node.scaleY = scale;
    node.size = { width: node.image.frame.width, height: node.image.frame.height };
    node.visible = visible;
    node.image.setCrop().setVisible(visible);
  }

  private placeBarNode(node: ImageNode, frame: { w: number; h: number }, x: number, y: number, width: number, height: number, pct: number): void {
    if (!node.isEffectivelyActive()) return;
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

function requireSceneNode<T extends GameNode>(nodesByName: ReadonlyMap<string, GameNode>, name: string): T {
  const node = nodesByName.get(name);
  if (!node) throw new Error(`Bottom HUD scene is missing node '${name}'`);
  return node as T;
}
