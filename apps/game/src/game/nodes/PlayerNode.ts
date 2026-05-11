import Phaser from 'phaser';
import { NODE_TYPE_IDS, AnimatedImageNode, CollisionRectNode, GameNode, type GameNodeOptions } from '../../nodes';

export class PlayerNode extends GameNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.PlayerNode;

  constructor(options: GameNodeOptions = {}) {
    super({ name: 'Player', className: 'PlayerNode', ...options });
  }

  get image(): Phaser.GameObjects.Image {
    return this.imageNode.image;
  }

  spawnAt(x: number, y: number): Phaser.GameObjects.Image {
    this.bodyNode.setPosition(x, y);
    this.imageNode.update(0);
    const movement = this.getNode('PlayerMovementController') as unknown as MovementControllerLike | undefined;
    if (typeof movement?.setPlayer === 'function') movement.setPlayer(this.bodyNode);
    else movement?.callScriptMethod?.('setPlayer', this.bodyNode);
    return this.image;
  }

  private get bodyNode(): CollisionRectNode {
    return this.requireNode<CollisionRectNode>('PlayerBody');
  }

  private get imageNode(): AnimatedImageNode {
    return this.requireNode<AnimatedImageNode>('PlayerImage');
  }
}

interface MovementControllerLike {
  setPlayer?(player: CollisionRectNode): void;
  callScriptMethod?(name: string, ...args: unknown[]): unknown;
}
