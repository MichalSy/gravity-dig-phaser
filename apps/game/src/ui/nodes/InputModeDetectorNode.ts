import { GameplayInputNode } from '../../app/nodes';
import { GameNode } from '../../nodes';
import type { InputMode } from '../HudState';

export class InputModeDetectorNode extends GameNode {
  private inputState!: GameplayInputNode;
  override readonly dependencies = ['GameplayInput'] as const;

  constructor() {
    super({ name: 'UI.InputModeDetector', order: -10, className: 'InputModeDetectorNode' });
  }

  resolve(): void {
    this.inputState = this.requireNode<GameplayInputNode>('GameplayInput');
  }

  update(): void {
    this.inputState.setInputMode(this.detectInputMode());
  }

  private detectInputMode(): InputMode {
    const gamepad = navigator.getGamepads?.().find((pad) => Boolean(pad));
    if (gamepad) return 'gamepad';
    if (this.isTouchDevice()) return 'touch';
    return 'desktop';
  }

  private isTouchDevice(): boolean {
    const smallTouchViewport = navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) < 768;
    return window.matchMedia('(pointer: coarse)').matches || smallTouchViewport;
  }
}
