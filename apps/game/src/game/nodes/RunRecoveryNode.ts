import { GameNode } from '../../nodes';
import { MiningToolNode } from './MiningToolNode';
import { PlayerStateManagerNode } from './PlayerStateManagerNode';

export class RunRecoveryNode extends GameNode {
  private playerState!: PlayerStateManagerNode;
  private miningTool!: MiningToolNode;
  override readonly dependencies = ['playerState', 'miningTool'] as const;

  constructor() {
    super({ name: 'runRecovery', order: 50, className: 'RunRecoveryNode' });
  }

  resolve(): void {
    this.playerState = this.requireNode<PlayerStateManagerNode>('playerState');
    this.miningTool = this.requireNode<MiningToolNode>('miningTool');
  }

  update(deltaMs: number): void {
    if (this.miningTool.isMiningPressed()) return;
    this.playerState.recoverEnergy(deltaMs / 1000);
  }
}
