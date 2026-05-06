import { GameplayInputNode, HudStateNode } from '../../app/nodes';
import { SceneNode, type NodeContext } from '../../nodes';
import type { InputMode } from '../HudState';
import { BottomHudNode } from './BottomHudNode';
import { StatusHudNode } from './StatusHudNode';
import { TouchControlsNode } from './TouchControlsNode';

export class GameplayUiRootNode extends SceneNode {
  private inputState!: GameplayInputNode;

  constructor() {
    super({ rootName: 'ui.gameplay', order: 100, className: 'GameplayUiRootNode', sizeMode: 'explicit', boundsMode: 'content', debugScrollFactor: 0 });
    this.addChild(new StatusHudNode());
    this.addChild(new BottomHudNode());
    this.addChild(new TouchControlsNode());
  }

  override readonly dependencies = ['gameplayInput', 'hudState'] as const;

  override init(ctx: NodeContext): void {
    super.init(ctx);
  }

  resolve(): void {
    this.inputState = this.requireNode<GameplayInputNode>('gameplayInput');
  }

  override update(): void {
    super.update();
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

export type { HudStateNode };
