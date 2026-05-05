import { GameNode, type GameNodeOptions } from './GameNode';

export interface TransformNodeOptions extends GameNodeOptions {
  depth?: number;
  scale?: number;
  scrollFactor?: number;
}

export abstract class TransformNode extends GameNode {
  depth: number;
  scale: number;
  scrollFactor: number;

  protected constructor(options: TransformNodeOptions = {}) {
    super(options);
    this.depth = options.depth ?? 0;
    this.scale = options.scale ?? 1;
    this.scrollFactor = options.scrollFactor ?? 1;
  }
}
