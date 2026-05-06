import Phaser from 'phaser';
import { NODE_TYPE_IDS, AnimatedImageNode, CollisionRectNode, GameNode, type GameNodeOptions } from '../../nodes';
import { PlayerMovementControllerNode } from './PlayerMovementControllerNode';

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
    this.requireNode<PlayerMovementControllerNode>('PlayerMovementController').setPlayer(this.bodyNode);
    return this.image;
  }

  private get bodyNode(): CollisionRectNode {
    return this.requireNode<CollisionRectNode>('PlayerBody');
  }

  private get imageNode(): AnimatedImageNode {
    return this.requireNode<AnimatedImageNode>('PlayerImage');
  }
}
