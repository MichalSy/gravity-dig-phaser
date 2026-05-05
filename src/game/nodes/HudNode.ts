import { GameplayInputNode, HudStateNode } from '../../app/nodes';
import { GameNode } from '../../nodes';
import { buildHudState } from '../gameplayLogic';
import { CameraZoomNode } from './CameraZoomNode';
import { GameWorldNode } from './GameWorldNode';
import { MiningToolNode } from './MiningToolNode';
import { PlayerStateManagerNode } from './PlayerStateManagerNode';

export class HudNode extends GameNode {
  private world!: GameWorldNode;
  private playerState!: PlayerStateManagerNode;
  private miningTool!: MiningToolNode;
  private cameraZoom!: CameraZoomNode;
  private gameplayInput!: GameplayInputNode;
  private hudState!: HudStateNode;
  override readonly dependencies = ['world', 'playerState', 'miningTool', 'cameraZoom', 'gameplayInput', 'hudState'] as const;

  constructor() {
    super({ name: 'hud', order: 60 });
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('world');
    this.playerState = this.requireNode<PlayerStateManagerNode>('playerState');
    this.miningTool = this.requireNode<MiningToolNode>('miningTool');
    this.cameraZoom = this.requireNode<CameraZoomNode>('cameraZoom');
    this.gameplayInput = this.requireNode<GameplayInputNode>('gameplayInput');
    this.hudState = this.requireNode<HudStateNode>('hudState');
  }

  update(): void {
    this.hudState.setState(buildHudState({
      level: this.world.level,
      inputMode: this.gameplayInput.getInputMode(),
      playerState: this.playerState,
      miningTool: this.miningTool,
      cameraZoom: this.cameraZoom,
    }));
  }
}
