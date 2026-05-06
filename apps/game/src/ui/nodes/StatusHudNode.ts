import Phaser from 'phaser';
import { GameplayInputNode } from '../../app/nodes';
import { buildHudState } from '../../game/gameplayLogic';
import { GameWorldNode, PlayerStateManagerNode } from '../../game/nodes';
import { GameNode, ImageNode, type NodeContext, type NodeDebugProps } from '../../nodes';
import { hudScaleForWidth, UI_ATLAS } from './uiLayout';

export class StatusHudNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private world!: GameWorldNode;
  private playerState!: PlayerStateManagerNode;
  private gameplayInput!: GameplayInputNode;
  private readonly statusFrameNode: ImageNode;
  private readonly hpFillNode: ImageNode;
  private readonly fuelFillNode: ImageNode;
  override readonly dependencies = ['World', 'PlayerState', 'GameplayInput'] as const;

  constructor() {
    super({ name: 'UI.StatusHud', className: 'StatusHudNode', parentAnchor: 'top-left', sizeMode: 'explicit', debugScrollFactor: 0 });
    this.statusFrameNode = this.addChild(new ImageNode({ name: 'UI.StatusFrame', assetId: 'hud-hp-fuel-atlas#topHud', scrollFactor: 0 }));
    this.hpFillNode = this.addChild(new ImageNode({ name: 'UI.HpFill', assetId: 'hud-hp-fuel-atlas#hpBar', scrollFactor: 0 }));
    this.fuelFillNode = this.addChild(new ImageNode({ name: 'UI.FuelFill', assetId: 'hud-hp-fuel-atlas#fuelBar', scrollFactor: 0 }));
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('World');
    this.playerState = this.requireNode<PlayerStateManagerNode>('PlayerState');
    this.gameplayInput = this.requireNode<GameplayInputNode>('GameplayInput');
  }

  override getDebugProps(): NodeDebugProps {
    const state = this.getHudState();
    return {
      ...super.getDebugProps(),
      hp: state ? Math.round(state.health.current) : null,
      fuel: state ? Math.round(state.fuel.current) : null,
    };
  }

  update(): void {
    const state = this.getHudState();

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

  private getHudState() {
    return buildHudState({
      level: this.world.level,
      inputMode: this.gameplayInput.getInputMode(),
      playerState: this.playerState,
    });
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
