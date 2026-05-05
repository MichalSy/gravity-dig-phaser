import { GameNode } from '../../nodes';
import type { GameplayUiScene } from '../../ui/GameplayUiScene';
import { buildHudState } from '../gameplayLogic';
import { MiningToolNode } from '../MiningToolNode';
import { PlayerStateManagerNode } from '../PlayerStateManagerNode';
import { CameraZoomNode } from './CameraZoomNode';
import { GameWorldNode } from './GameWorldNode';

export class HudNode extends GameNode {
  private world!: GameWorldNode;
  private playerState!: PlayerStateManagerNode;
  private miningTool!: MiningToolNode;
  private cameraZoom!: CameraZoomNode;
  override readonly dependencies = ['world', 'playerState', 'miningTool', 'cameraZoom', 'ui.gameplay'] as const;

  constructor() {
    super({ name: 'hud', order: 60 });
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('world');
    this.playerState = this.requireNode<PlayerStateManagerNode>('playerState');
    this.miningTool = this.requireNode<MiningToolNode>('miningTool');
    this.cameraZoom = this.requireNode<CameraZoomNode>('cameraZoom');
  }

  update(): void {
    this.uiScene.setHudState(buildHudState({
      level: this.world.level,
      inputMode: this.uiScene.getInputMode(),
      playerState: this.playerState,
      miningTool: this.miningTool,
      cameraZoom: this.cameraZoom,
    }));
  }

  private get uiScene(): GameplayUiScene {
    return this.requireNode<GameplayUiScene>('ui.gameplay');
  }
}
