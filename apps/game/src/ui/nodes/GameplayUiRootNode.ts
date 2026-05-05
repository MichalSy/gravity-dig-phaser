import { GameplayInputNode, HudStateNode } from '../../app/nodes';
import Phaser from 'phaser';
import { NodeRoot, type NodeContext } from '../../nodes';
import type { InputMode } from '../HudState';
import { BottomHudNode } from './BottomHudNode';
import { StatusHudNode } from './StatusHudNode';
import { TouchControlsNode } from './TouchControlsNode';

export class GameplayUiRootNode extends NodeRoot {
  private phaserScene!: Phaser.Scene;
  private inputState!: GameplayInputNode;

  constructor() {
    super({ rootName: 'ui.gameplay', order: 100, className: 'GameplayUiRootNode', sizeMode: 'explicit', boundsMode: 'content', debugScrollFactor: 0 });
    this.addChild(new StatusHudNode());
    this.addChild(new BottomHudNode());
    this.addChild(new TouchControlsNode());
  }

  override readonly dependencies = ['gameplayInput', 'hudState'] as const;

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.size = { width: this.phaserScene.scale.width, height: this.phaserScene.scale.height };
  }

  resolve(): void {
    this.inputState = this.requireNode<GameplayInputNode>('gameplayInput');
  }

  update(): void {
    this.size = { width: this.phaserScene.scale.width, height: this.phaserScene.scale.height };
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
