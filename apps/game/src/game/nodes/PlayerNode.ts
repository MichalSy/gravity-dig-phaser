import { GameNode, ImageNode } from '../../nodes';
import { PlayerControllerNode } from './PlayerControllerNode';
import { PlayerPresentationNode } from './PlayerPresentationNode';

export class PlayerNode extends GameNode {
  constructor() {
    super({ name: 'player', order: 8 });
    this.addChild(new PlayerControllerNode());
    this.addChild(new PlayerPresentationNode());
    this.addChild(
      new ImageNode({
        name: 'playerImage',
        assetId: 'player-idle-0',
        order: 50,
        anchor: 'center',
        depth: 20,
        scale: 0.9,
        syncMode: 'object-to-node',
      }),
    );
  }
}
