import Phaser from 'phaser';
import { AnimatedImageNode, GameNode } from '../../nodes';
import { PlayerControllerNode } from './PlayerControllerNode';
import { PlayerPresentationNode } from './PlayerPresentationNode';

export class PlayerNode extends GameNode {
  constructor() {
    super({ name: 'player', order: 8, className: 'PlayerNode' });
    this.addChild(new PlayerControllerNode());
    this.addChild(new PlayerPresentationNode());
    this.addChild(
      new AnimatedImageNode({
        name: 'playerImage',
        animationSetId: 'character',
        animationId: 'idle.east',
        order: 50,
        origin: { x: 0.5, y: 0.5 },
        depth: 20,
        scale: 0.9,
        syncMode: 'object-to-node',
      }),
    );
  }

  get image(): Phaser.GameObjects.Image {
    return this.imageNode.image;
  }

  spawnAt(x: number, y: number): Phaser.GameObjects.Image {
    this.image.setPosition(x, y);
    this.imageNode.update(0);
    this.requireNode<PlayerControllerNode>('playerController').setPlayer(this.image);
    return this.image;
  }

  private get imageNode(): AnimatedImageNode {
    return this.requireNode<AnimatedImageNode>('playerImage');
  }
}
