import { GameNode } from '../../nodes';
import type { HudState } from '../../ui/HudState';

export class HudStateNode extends GameNode {
  private state?: HudState;

  constructor() {
    super({ name: 'hudState', order: 0, className: 'HudStateNode' });
  }

  setState(state: HudState): void {
    this.state = state;
  }

  getState(): HudState | undefined {
    return this.state;
  }
}
