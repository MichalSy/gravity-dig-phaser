import Phaser from 'phaser';
import { HudStateNode } from '../../app/nodes';
import { GameNode, ImageNode, type NodeContext, type NodeDebugProps } from '../../nodes';
import { hudScaleForWidth, UI_ATLAS, UI_DEPTH } from './uiLayout';

export class StatusHudNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private hudState!: HudStateNode;
  private readonly statusFrameNode: ImageNode;
  private readonly hpFillNode: ImageNode;
  private readonly fuelFillNode: ImageNode;
  override readonly dependencies = ['hudState'] as const;

  constructor() {
    super({ name: 'ui.statusHud', order: 0, className: 'StatusHudNode', parentAnchor: 'top-left', sizeMode: 'explicit' });
    this.statusFrameNode = this.addChild(new ImageNode({ name: 'ui.statusFrame', assetId: 'hud-hp-fuel-atlas#topHud', order: 0, depth: UI_DEPTH + 10, scrollFactor: 0 }));
    this.hpFillNode = this.addChild(new ImageNode({ name: 'ui.hpFill', assetId: 'hud-hp-fuel-atlas#hpBar', order: 10, depth: UI_DEPTH + 11, scrollFactor: 0 }));
    this.fuelFillNode = this.addChild(new ImageNode({ name: 'ui.fuelFill', assetId: 'hud-hp-fuel-atlas#fuelBar', order: 20, depth: UI_DEPTH + 11, scrollFactor: 0 }));
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
  }

  resolve(): void {
    this.hudState = this.requireNode<HudStateNode>('hudState');
  }

  override getDebugProps(): NodeDebugProps {
    const state = this.hudState?.getState();
    return {
      ...super.getDebugProps(),
      hp: state ? Math.round(state.health.current) : null,
      fuel: state ? Math.round(state.fuel.current) : null,
    };
  }

  update(): void {
    const state = this.hudState.getState();
    if (!state) return;

    const scale = hudScaleForWidth(this.phaserScene.scale.width);
    const atlasScale = (UI_ATLAS.topDisplayWidth * scale) / UI_ATLAS.topHud.w;
    const pctHp = Phaser.Math.Clamp(state.health.current / state.health.max, 0, 1);
    const pctFuel = Phaser.Math.Clamp(state.fuel.current / state.fuel.max, 0, 1);

    this.position = { x: 18, y: 18 };
    this.size = { width: UI_ATLAS.topHud.w * atlasScale, height: UI_ATLAS.topHud.h * atlasScale };

    this.placeRegionNode(this.statusFrameNode, 0, 0, atlasScale);
    this.placeBarNode(this.hpFillNode, UI_ATLAS.hpBar, UI_ATLAS.hpSlot.x * atlasScale, UI_ATLAS.hpSlot.y * atlasScale, UI_ATLAS.hpSlot.w * atlasScale, UI_ATLAS.hpSlot.h * atlasScale, pctHp);
    this.placeBarNode(this.fuelFillNode, UI_ATLAS.fuelBar, UI_ATLAS.fuelSlot.x * atlasScale, UI_ATLAS.fuelSlot.y * atlasScale, UI_ATLAS.fuelSlot.w * atlasScale, UI_ATLAS.fuelSlot.h * atlasScale, pctFuel);
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
}
