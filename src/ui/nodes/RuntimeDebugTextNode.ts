import Phaser from 'phaser';
import { HudStateNode } from '../../app/nodes';
import { GameNode, type NodeContext } from '../../nodes';
import { bottomHudDisplayHeight, UI_DEPTH } from './uiLayout';

export class RuntimeDebugTextNode extends GameNode {
  private phaserScene!: Phaser.Scene;
  private hudState!: HudStateNode;
  private debugText!: Phaser.GameObjects.Text;
  override readonly dependencies = ['hudState'] as const;

  constructor() {
    super({ name: 'ui.runtimeDebugText', order: 20 });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.debugText = this.phaserScene.add
      .text(14, 0, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        color: '#bfdbfe',
        backgroundColor: 'rgba(2,6,23,0.58)',
        padding: { x: 10, y: 8 },
        lineSpacing: 2,
      })
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 40)
      .setResolution(Math.max(2, window.devicePixelRatio || 1));
  }

  resolve(): void {
    this.hudState = this.requireNode<HudStateNode>('hudState');
  }

  update(): void {
    const state = this.hudState.getState();
    if (!state) return;

    const width = this.phaserScene.scale.width;
    const height = this.phaserScene.scale.height;
    const bottomHudHeight = bottomHudDisplayHeight(width);
    this.debugText
      .setText([state.debug, state.zoom, state.target])
      .setOrigin(0, 1)
      .setPosition(14, height - bottomHudHeight - 24)
      .setWordWrapWidth(Math.max(320, Math.min(560, width - 28)))
      .setVisible(true);
  }

  destroy(): void {
    this.debugText?.destroy();
  }
}
