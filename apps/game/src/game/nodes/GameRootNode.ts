import { GAME_HEIGHT, GAME_WIDTH } from '../../config/gameConfig';
import { NODE_TYPE_IDS, TransformNode, type TransformNodeOptions } from '../../nodes';

export class GameRootNode extends TransformNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.GameRootNode;
  static override readonly sceneType = 'GameRootNode';

  constructor(options: TransformNodeOptions = {}) {
    super({
      ...options,
      name: options.name ?? 'GameRoot',
      className: options.className ?? 'GameRootNode',
      sizeMode: options.sizeMode ?? 'explicit',
      boundsMode: options.boundsMode ?? 'none',
      size: {
        width: options.size?.width ?? GAME_WIDTH,
        height: options.size?.height ?? GAME_HEIGHT,
      },
    });
  }
}
