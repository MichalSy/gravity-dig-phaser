import Phaser from 'phaser';
import { AnimatedImageNode, CollisionRectNode, GameNode } from '../../nodes';
import { PlayerControllerNode } from './PlayerControllerNode';
import { PlayerAnimatorNode } from './PlayerAnimatorNode';

export class PlayerNode extends GameNode {
  constructor() {
    super({ name: 'player', order: 8, className: 'PlayerNode' });
    this.addChild(new PlayerControllerNode());
    const body = this.addChild(new CollisionRectNode({
      name: 'playerBody',
      order: 20,
      size: { width: 40, height: 64 },
      origin: { x: 0.5, y: 0.5 },
    }));
    body.addChild(
      new AnimatedImageNode({
        name: 'playerImage',
        animationSetId: 'character',
        animationId: 'idle.east',
        order: 10,
        parentAnchor: 'center',
        position: { x: 0, y: 0 },
        origin: { x: 0.5, y: 0.5 },
        depth: 20,
        scale: 0.9,
      }),
    );
    this.addChild(new PlayerAnimatorNode());
  }

  get image(): Phaser.GameObjects.Image {
    return this.imageNode.image;
  }

  spawnAt(x: number, y: number): Phaser.GameObjects.Image {
    this.bodyNode.setPosition(x, y);
    this.imageNode.update(0);
    this.requireNode<PlayerControllerNode>('playerController').setPlayer(this.bodyNode);
    return this.image;
  }

  private get bodyNode(): CollisionRectNode {
    return this.requireNode<CollisionRectNode>('playerBody');
  }

  private get imageNode(): AnimatedImageNode {
    return this.requireNode<AnimatedImageNode>('playerImage');
  }
}
