import { GameNode, type GameNodeOptions } from './GameNode';
import { NODE_TYPE_IDS } from './NodeTypeIds';

export interface NodeRootOptions extends GameNodeOptions {
  rootName: string;
}

export class NodeRoot extends GameNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.NodeRoot;

  readonly rootName: string;

  constructor(options: NodeRootOptions) {
    super({
      ...options,
      name: options.name ?? options.rootName,
      className: options.className ?? 'NodeRoot',
      sizeMode: options.sizeMode ?? 'explicit',
      boundsMode: options.boundsMode ?? 'none',
    });
    this.rootName = options.rootName;
  }
}
