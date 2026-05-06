import { GameNode } from '../../nodes';
import { createAutoSaveData, type AutoSaveData } from '../nodeData';
import { PlayerStateManagerNode } from './PlayerStateManagerNode';

export class AutoSaveNode extends GameNode {
  private playerState!: PlayerStateManagerNode;
  override readonly dependencies = ['PlayerState'] as const;
  readonly data: AutoSaveData = createAutoSaveData();

  constructor() {
    super({ name: 'AutoSave', className: 'AutoSaveNode' });
  }

  resolve(): void {
    this.playerState = this.requireNode<PlayerStateManagerNode>('PlayerState');
  }

  update(deltaMs: number): void {
    this.data.saveTimerMs += deltaMs;
    if (this.data.saveTimerMs < 1000) return;

    this.data.saveTimerMs = 0;
    this.playerState.saveActiveRun();
  }
}
