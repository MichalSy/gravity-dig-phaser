import { GameNode, type GameNodeOptions } from './GameNode';

export interface NodeRootOptions extends GameNodeOptions {
  rootName: string;
}

export class NodeRoot extends GameNode {
  readonly rootName: string;

  constructor(options: NodeRootOptions) {
    super({ ...options, name: options.name ?? options.rootName, className: options.className ?? 'NodeRoot' });
    this.rootName = options.rootName;
  }
}
