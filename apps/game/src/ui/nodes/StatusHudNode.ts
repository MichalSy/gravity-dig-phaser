import Phaser from 'phaser';
import { GameplayInputNode } from '../../app/nodes';
import { buildHudState } from '../../game/gameplayLogic';
import { GameWorldNode, PlayerStateManagerNode } from '../../game/nodes';
import { NODE_TYPE_IDS, ImageNode, TransformNode, type NodeDebugProps, type TransformNodeOptions } from '../../nodes';
import { UI_ATLAS } from './uiLayout';

export class StatusHudNode extends TransformNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.StatusHudNode;

  private world!: GameWorldNode;
  private playerState!: PlayerStateManagerNode;
  private gameplayInput!: GameplayInputNode;
  private hpFillNode!: ImageNode;
  private fuelFillNode!: ImageNode;
  override readonly dependencies = ['World', 'PlayerState', 'GameplayInput'] as const;

  constructor(options: TransformNodeOptions = {}) {
    super({ name: 'UI.StatusHud', className: 'StatusHudNode', parentAnchor: 'top-left', sizeMode: 'explicit', debugScrollFactor: 0, ...options });
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('World');
    this.playerState = this.requireNode<PlayerStateManagerNode>('PlayerState');
    this.gameplayInput = this.requireNode<GameplayInputNode>('GameplayInput');
    this.hpFillNode = this.requireNode<ImageNode>('UI.HpFill');
    this.fuelFillNode = this.requireNode<ImageNode>('UI.FuelFill');
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

    const pctHp = Phaser.Math.Clamp(state.health.current / state.health.max, 0, 1);
    const pctFuel = Phaser.Math.Clamp(state.fuel.current / state.fuel.max, 0, 1);

    this.updateBarFill(this.hpFillNode, UI_ATLAS.hpBar, pctHp);
    this.updateBarFill(this.fuelFillNode, UI_ATLAS.fuelBar, pctFuel);
  }

  private getHudState() {
    return buildHudState({
      level: this.world.level,
      inputMode: this.gameplayInput.getInputMode(),
      playerState: this.playerState,
    });
  }

  private updateBarFill(node: ImageNode, frame: { w: number; h: number }, pct: number): void {
    const safePct = Phaser.Math.Clamp(pct, 0, 1);
    const cropWidth = Math.max(1, Math.round(frame.w * safePct));
    node.visible = safePct > 0;
    node.image.setCrop(0, 0, cropWidth, frame.h).setVisible(safePct > 0);
  }
}
