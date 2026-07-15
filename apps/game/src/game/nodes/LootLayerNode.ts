import Phaser from 'phaser';
import { GameNode, NODE_TYPE_IDS, type GameNodeOptions, type NodeContext } from '../../nodes';

export class LootLayerNode extends GameNode {
  static override readonly nodeTypeId = NODE_TYPE_IDS.LootLayerNode;

  private container?: Phaser.GameObjects.Container;

  constructor(options: GameNodeOptions = {}) {
    super({ name: 'LootLayer', className: 'LootLayerNode', ...options });
  }

  init(ctx: NodeContext): void {
    this.container = ctx.phaserScene.add.container(0, 0);
  }

  addLootObjects(objects: readonly Phaser.GameObjects.GameObject[]): void {
    if (!this.container) throw new Error('LootLayer is not initialized');
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
