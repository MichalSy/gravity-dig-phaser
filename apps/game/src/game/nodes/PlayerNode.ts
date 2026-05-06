import Phaser from 'phaser';
import { AnimatedImageNode, CollisionRectNode, GameNode } from '../../nodes';
import { PlayerMovementControllerNode } from './PlayerMovementControllerNode';

export class PlayerNode extends GameNode {
  constructor() {
    super({ name: 'Player', className: 'PlayerNode' });
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
