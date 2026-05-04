import { GameNode, type GameNodeOptions } from './GameNode';

export interface NodeSceneOptions extends GameNodeOptions {
  sceneName: string;
}

export class NodeScene extends GameNode {
  readonly sceneName: string;

  constructor(options: NodeSceneOptions) {
    super({ ...options, name: options.name ?? options.sceneName });
    this.sceneName = options.sceneName;
  }
}
