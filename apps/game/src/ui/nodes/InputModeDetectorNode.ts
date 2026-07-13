import { NODE_TYPE_IDS, GameNode, type GameNodeOptions } from '../../nodes';
import type { InputMode } from '../HudState';

interface GameplayInputLike {
  setInputMode(mode: InputMode): void;
}

export class InputModeDetectorNode extends GameNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.InputModeDetectorNode;

  private inputState!: GameplayInputLike;
  override readonly dependencies = ['GameplayInput'] as const;

  constructor(options: GameNodeOptions = {}) {
    super({ name: 'UI.InputModeDetector', className: 'InputModeDetectorNode', ...options });
  }

  resolve(): void {
    this.inputState = this.requireNode('GameplayInput') as unknown as GameplayInputLike;
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
