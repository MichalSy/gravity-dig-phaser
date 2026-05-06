import { GameNode } from '../../nodes';
import { MiningToolNode } from './MiningToolNode';
import { PlayerStateManagerNode } from './PlayerStateManagerNode';

export class RunRecoveryNode extends GameNode {
  private playerState!: PlayerStateManagerNode;
  private miningTool!: MiningToolNode;
  override readonly dependencies = ['PlayerState', 'MiningTool'] as const;

  constructor() {
    super({ name: 'RunRecovery', order: 50, className: 'RunRecoveryNode' });
  }

  resolve(): void {
    this.playerState = this.requireNode<PlayerStateManagerNode>('PlayerState');
    this.miningTool = this.requireNode<MiningToolNode>('MiningTool');
  }

  update(deltaMs: number): void {
    if (this.miningTool.isMiningPressed()) return;
    this.playerState.recoverEnergy(deltaMs / 1000);
  }
}
