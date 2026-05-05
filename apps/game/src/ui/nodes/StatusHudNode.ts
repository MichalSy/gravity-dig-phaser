import Phaser from 'phaser';
import { HudStateNode } from '../../app/nodes';
import { GameNode, ImageNode, type NodeContext, type NodeDebugBounds, type NodeDebugProps } from '../../nodes';
import { hudScaleForWidth, placeAtlasBar, UI_ATLAS, UI_DEPTH } from './uiLayout';

export class StatusHudNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private hudState!: HudStateNode;
  private readonly statusFrameNode: ImageNode;
  private readonly hpFillNode: ImageNode;
  private readonly fuelFillNode: ImageNode;
  override readonly dependencies = ['hudState'] as const;

  constructor() {
    super({ name: 'ui.statusHud', order: 0, className: 'StatusHudNode' });
    this.statusFrameNode = this.addChild(new ImageNode({ name: 'ui.statusFrame', assetId: 'hud-hp-fuel-atlas', order: 0, depth: UI_DEPTH + 10, scrollFactor: 0, syncMode: 'object-to-node' }));
    this.hpFillNode = this.addChild(new ImageNode({ name: 'ui.hpFill', assetId: 'hud-hp-fuel-atlas', order: 10, depth: UI_DEPTH + 11, scrollFactor: 0, syncMode: 'object-to-node' }));
    this.fuelFillNode = this.addChild(new ImageNode({ name: 'ui.fuelFill', assetId: 'hud-hp-fuel-atlas', order: 20, depth: UI_DEPTH + 11, scrollFactor: 0, syncMode: 'object-to-node' }));
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
  }

  resolve(): void {
    this.hudState = this.requireNode<HudStateNode>('hudState');
  }

  override getDebugBounds(): NodeDebugBounds | undefined {
    return this.statusFrameNode.getDebugBounds();
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

    const x = 18;
    const y = 18;
    const scale = hudScaleForWidth(this.phaserScene.scale.width);
    const atlasScale = (UI_ATLAS.topDisplayWidth * scale) / UI_ATLAS.topHud.w;
    const pctHp = Phaser.Math.Clamp(state.health.current / state.health.max, 0, 1);
    const pctFuel = Phaser.Math.Clamp(state.fuel.current / state.fuel.max, 0, 1);

    this.statusFrameNode.image
      .setPosition(x - UI_ATLAS.topHud.x * atlasScale, y - UI_ATLAS.topHud.y * atlasScale)
      .setCrop(UI_ATLAS.topHud.x, UI_ATLAS.topHud.y, UI_ATLAS.topHud.w, UI_ATLAS.topHud.h)
      .setScale(atlasScale)
      .setVisible(true);

    placeAtlasBar(this.hpFillNode.image, UI_ATLAS.hpBar, x + UI_ATLAS.hpSlot.x * atlasScale, y + UI_ATLAS.hpSlot.y * atlasScale, UI_ATLAS.hpSlot.w * atlasScale, UI_ATLAS.hpSlot.h * atlasScale, pctHp);
    placeAtlasBar(this.fuelFillNode.image, UI_ATLAS.fuelBar, x + UI_ATLAS.fuelSlot.x * atlasScale, y + UI_ATLAS.fuelSlot.y * atlasScale, UI_ATLAS.fuelSlot.w * atlasScale, UI_ATLAS.fuelSlot.h * atlasScale, pctFuel);
  }
}
