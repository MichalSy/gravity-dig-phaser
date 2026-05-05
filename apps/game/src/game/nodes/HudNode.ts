import { GameplayInputNode, HudStateNode } from '../../app/nodes';
import { GameNode } from '../../nodes';
import { buildHudState } from '../gameplayLogic';
import { GameWorldNode } from './GameWorldNode';
import { PlayerStateManagerNode } from './PlayerStateManagerNode';

export class HudNode extends GameNode {
  private world!: GameWorldNode;
  private playerState!: PlayerStateManagerNode;
  private gameplayInput!: GameplayInputNode;
  private hudState!: HudStateNode;
  override readonly dependencies = ['world', 'playerState', 'gameplayInput', 'hudState'] as const;

  constructor() {
    super({ name: 'hud', order: 60, className: 'HudNode' });
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('world');
    this.playerState = this.requireNode<PlayerStateManagerNode>('playerState');
    this.gameplayInput = this.requireNode<GameplayInputNode>('gameplayInput');
    this.hudState = this.requireNode<HudStateNode>('hudState');
  }

  update(): void {
    this.hudState.setState(buildHudState({
      level: this.world.level,
      inputMode: this.gameplayInput.getInputMode(),
      playerState: this.playerState,
    }));
  }
}
