import Phaser from 'phaser';
import { NodeRoot, type NodeRootOptions } from './NodeRoot';
import { NODE_TYPE_IDS } from './NodeTypeIds';
import type { NodeContext } from './GameNode';

export interface SceneNodeOptions extends NodeRootOptions {}

export class SceneNode extends NodeRoot {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.SceneNode;

  private phaserScene?: Phaser.Scene;

  constructor(options: SceneNodeOptions) {
    super({
      ...options,
      className: options.className ?? 'SceneNode',
      position: options.position ?? { x: 0, y: 0 },
      origin: options.origin ?? { x: 0, y: 0 },
      sizeMode: options.sizeMode ?? 'explicit',
      boundsMode: options.boundsMode ?? 'none',
    });
  }

  init(ctx: NodeContext): void {
    this.phaserScene = ctx.phaserScene;
    this.updateViewportSize();
  }

  update(): void {
    this.updateViewportSize();
  }

  private updateViewportSize(): void {
    if (!this.phaserScene) return;
    this.size = { width: this.phaserScene.scale.width, height: this.phaserScene.scale.height };
  }
}
