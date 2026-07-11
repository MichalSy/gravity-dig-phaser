import Phaser from 'phaser';
import { GameplayInputNode } from '../../app/nodes';
import { buildHudState } from '../../game/gameplayLogic';
import { GameWorldNode, PlayerStateManagerNode } from '../../game/nodes';
import { NODE_TYPE_IDS, collectNodesByName, GameNode, ImageNode, TextNode, TransformNode, type ExposedPropGroup, type NodeContext, type NodeDebugProps, type TransformNodeOptions } from '../../nodes';
import type { ItemId } from '../../player/types';
import { computeBottomHudLayout } from '../layout/bottomHudLayout';
import { TEXT, UI_ATLAS } from './uiLayout';

export class BottomHudNode extends TransformNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.BottomHudNode;

  static override readonly sceneType: string = 'BottomHudNode';
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = TransformNode.exposedPropGroups;

  private phaserScene!: Phaser.Scene;
  private world!: GameWorldNode;
  private playerState!: PlayerStateManagerNode;
  private gameplayInput!: GameplayInputNode;
  private energyFillNode!: ImageNode;
  private readonly slotItemNodes: ImageNode[] = [];
  private readonly slotLabelNodes: TextNode[] = [];
  override readonly dependencies = ['World', 'PlayerState', 'GameplayInput'] as const;

  constructor(options: TransformNodeOptions = {}) {
    super({ name: 'UI.BottomHud', className: 'BottomHudNode', parentAnchor: 'bottom-center', origin: { x: 0, y: 1 }, sizeMode: 'content', debugScrollFactor: 0, ...options });
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

  override prepareLayout(): void {
    const state = this.getHudState();

    const viewportWidth = this.phaserScene.scale.width;
    const viewportHeight = this.phaserScene.scale.height;
    const layout = computeBottomHudLayout(viewportWidth, viewportHeight, state);
    const frameWidth = layout.totalWidth;
    const frameHeight = UI_ATLAS.bottomHud.h * layout.atlasScale;

    this.position = { x: -frameWidth / 2, y: 0 };
    if (this.sizeMode === 'explicit') this.size = { width: frameWidth, height: frameHeight };

    this.updateBarFill(this.energyFillNode, UI_ATLAS.energyBar, layout.energyPct);

    for (let i = 0; i < this.slotLabelNodes.length; i += 1) {
      const labelNode = this.slotLabelNodes[i];
      const slot = state.cargo.slots[i];
      const slotItemNode = this.slotItemNodes[i];
      if (slotItemNode.isEffectivelyActive()) {
        this.updateSlotItemAppearance(slotItemNode, slot?.itemId);
      }

      if (labelNode.isEffectivelyActive()) {
        labelNode.text = slot?.itemId ? `${ITEM_SHORT_LABELS[slot.itemId]} x${slot.quantity}` : '';
      }
    }
  }

  private resolveChildNodes(): void {
    const nodesByName = collectNodesByName(this);
    this.energyFillNode = requireSceneNode<ImageNode>(nodesByName, 'UI.EnergyFill');

    this.slotItemNodes.length = 0;
    this.slotLabelNodes.length = 0;

    for (let i = 0; i < 4; i += 1) {
      const slotItemNode = requireSceneNode<ImageNode>(nodesByName, `UI.SlotItem${i}`);
      const slotLabelNode = requireSceneNode<TextNode>(nodesByName, `UI.SlotLabel${i}`);
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
    for (const prop of ['position', 'size']) this.markExposedPropReadOnly(prop, computedByHudLayout);
    for (const labelNode of this.slotLabelNodes) labelNode.markExposedPropReadOnly('text', 'computed from cargo contents');
  }

  private updateBarFill(node: ImageNode, frame: { w: number; h: number }, pct: number): void {
    if (!node.isEffectivelyActive()) return;
    const safePct = Phaser.Math.Clamp(pct, 0, 1);
    const cropWidth = Math.max(1, Math.round(frame.w * safePct));
    node.visible = safePct > 0;
    node.image.setCrop(0, 0, cropWidth, frame.h).setVisible(safePct > 0);
  }

  private updateSlotItemAppearance(node: ImageNode, itemId?: ItemId): void {
    if (!itemId) {
      node.image.clearTint();
      return;
    }
    node.image.setTint(ITEM_TINTS[itemId]);
  }
}

const ITEM_SHORT_LABELS: Record<ItemId, string> = {
  dirt: 'Er', sand: 'Sa', clay: 'Le', gravel: 'Ki', stone: 'St', basalt: 'Ba',
  copper: 'Cu', iron: 'Fe', gold: 'Au', diamond: 'Di',
  energy_cell: 'EZ', repair_kit: 'RK', teleport_bracelet: 'TP',
};

const ITEM_TINTS: Record<ItemId, number> = {
  dirt: 0x9a6a45, sand: 0xd8bd78, clay: 0xb96855, gravel: 0x8f8b83, stone: 0x9ca3af,
  basalt: 0x4b5563, copper: 0xd97745, iron: 0x94a3b8, gold: 0xfacc15, diamond: 0x67e8f9,
  energy_cell: 0x84cc16, repair_kit: 0xef4444, teleport_bracelet: 0xc084fc,
};

function requireSceneNode<T extends GameNode>(nodesByName: ReadonlyMap<string, GameNode>, name: string): T {
  const node = nodesByName.get(name);
  if (!node) throw new Error(`Bottom HUD scene is missing node '${name}'`);
  return node as T;
}
