import { GameNode, type GameNodeOptions } from './GameNode';

export interface TransformNodeOptions extends GameNodeOptions {
  depth?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  scrollFactor?: number;
}

export abstract class TransformNode extends GameNode {
  depth: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  scrollFactor: number;

  protected constructor(options: TransformNodeOptions = {}) {
    super(options);
    this.depth = options.depth ?? 0;
    this.scale = options.scale ?? 1;
    this.scaleX = options.scaleX ?? this.scale;
    this.scaleY = options.scaleY ?? this.scale;
    this.scrollFactor = options.scrollFactor ?? 1;
  }

  override getLocalScale(): { x: number; y: number } {
    return { x: this.scaleX, y: this.scaleY };
  }
}
