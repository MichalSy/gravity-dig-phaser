import { NODE_TYPE_IDS, TransformNode, type TransformNodeOptions } from '../../nodes';

export class MenuNode extends TransformNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.MenuNode;
  static override readonly sceneType: string = 'MenuNode';

  constructor(options: TransformNodeOptions = {}) {
    super({ name: 'Menu', className: 'MenuNode', ...options });
  }
}
