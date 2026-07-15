import Phaser from 'phaser';
import { GameNode, NODE_TYPE_IDS, type GameNodeOptions, type NodeContext } from '../../nodes';

export class EffectsLayerNode extends GameNode {
  static override readonly nodeTypeId = NODE_TYPE_IDS.EffectsLayerNode;

  private container?: Phaser.GameObjects.Container;

  constructor(options: GameNodeOptions = {}) {
    super({ name: 'EffectsLayer', className: 'EffectsLayerNode', ...options });
  }

  init(ctx: NodeContext): void {
    this.container = ctx.phaserScene.add.container(0, 0);
  }

  addEffectObjects(objects: readonly Phaser.GameObjects.GameObject[]): void {
    if (!this.container) throw new Error('EffectsLayer is not initialized');
    this.container.add([...objects]);
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    return this.container ? [this.container] : [];
  }

  destroy(): void {
    if (!this.container) return;
    this.container.removeAll(false);
    this.container.destroy();
    this.container = undefined;
  }
}
