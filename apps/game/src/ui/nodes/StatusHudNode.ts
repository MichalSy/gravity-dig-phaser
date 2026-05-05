import Phaser from 'phaser';
import { HudStateNode } from '../../app/nodes';
import { GameNode, type NodeContext, type NodeDebugBounds, type NodeDebugProps } from '../../nodes';
import { hudScaleForWidth, placeAtlasBar, UI_ATLAS, UI_DEPTH } from './uiLayout';

export class StatusHudNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private hudState!: HudStateNode;
  private statusFrame!: Phaser.GameObjects.Image;
  private hpFill!: Phaser.GameObjects.Image;
  private fuelFill!: Phaser.GameObjects.Image;
  override readonly dependencies = ['hudState'] as const;

  constructor() {
    super({ name: 'ui.statusHud', order: 0 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.statusFrame = this.phaserScene.add.image(0, 0, 'hud-hp-fuel-atlas').setOrigin(0, 0).setScrollFactor(0).setDepth(UI_DEPTH + 10);
    this.hpFill = this.phaserScene.add.image(0, 0, 'hud-hp-fuel-atlas').setOrigin(0, 0).setScrollFactor(0).setDepth(UI_DEPTH + 11);
    this.fuelFill = this.phaserScene.add.image(0, 0, 'hud-hp-fuel-atlas').setOrigin(0, 0).setScrollFactor(0).setDepth(UI_DEPTH + 11);
  }

  resolve(): void {
    this.hudState = this.requireNode<HudStateNode>('hudState');
  }

  override getDebugBounds(): NodeDebugBounds | undefined {
    const bounds = this.statusFrame?.getBounds();
    if (!bounds) return undefined;
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, scrollFactor: 0 };
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

    this.statusFrame
      .setPosition(x - UI_ATLAS.topHud.x * atlasScale, y - UI_ATLAS.topHud.y * atlasScale)
      .setCrop(UI_ATLAS.topHud.x, UI_ATLAS.topHud.y, UI_ATLAS.topHud.w, UI_ATLAS.topHud.h)
      .setScale(atlasScale)
      .setVisible(true);

    placeAtlasBar(this.hpFill, UI_ATLAS.hpBar, x + UI_ATLAS.hpSlot.x * atlasScale, y + UI_ATLAS.hpSlot.y * atlasScale, UI_ATLAS.hpSlot.w * atlasScale, UI_ATLAS.hpSlot.h * atlasScale, pctHp);
    placeAtlasBar(this.fuelFill, UI_ATLAS.fuelBar, x + UI_ATLAS.fuelSlot.x * atlasScale, y + UI_ATLAS.fuelSlot.y * atlasScale, UI_ATLAS.fuelSlot.w * atlasScale, UI_ATLAS.fuelSlot.h * atlasScale, pctFuel);
  }

  destroy(): void {
    this.statusFrame?.destroy();
    this.hpFill?.destroy();
    this.fuelFill?.destroy();
  }
}
