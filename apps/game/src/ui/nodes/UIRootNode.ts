import { GAME_HEIGHT, GAME_WIDTH } from '../../config/gameConfig';
import { NODE_TYPE_IDS, TransformNode, type TransformNodeOptions } from '../../nodes';

export class UIRootNode extends TransformNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.UIRootNode;
  static override readonly sceneType = 'UIRootNode';

  constructor(options: TransformNodeOptions = {}) {
    super({
      ...options,
      name: options.name ?? 'UIRoot',
      className: options.className ?? 'UIRootNode',
      sizeMode: options.sizeMode ?? 'explicit',
      boundsMode: options.boundsMode ?? 'none',
      size: {
        width: options.size?.width ?? GAME_WIDTH,
        height: options.size?.height ?? GAME_HEIGHT,
      },
    });
  }
}
