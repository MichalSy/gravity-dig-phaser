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
  override readonly dependencies = ['World', 'PlayerState', 'GameplayInput', 'HudState'] as const;

  constructor() {
    super({ name: 'Hud', order: 60, className: 'HudNode' });
  }

  resolve(): void {
    this.world = this.requireNode<GameWorldNode>('World');
    this.playerState = this.requireNode<PlayerStateManagerNode>('PlayerState');
    this.gameplayInput = this.requireNode<GameplayInputNode>('GameplayInput');
    this.hudState = this.requireNode<HudStateNode>('HudState');
  }

  update(): void {
    this.hudState.setState(buildHudState({
      level: this.world.level,
      inputMode: this.gameplayInput.getInputMode(),
      playerState: this.playerState,
    }));
  }
}
