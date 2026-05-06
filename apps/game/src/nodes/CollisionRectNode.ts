import type { NodeDebugBounds, NodeDebugProps } from './GameNode';
import { NODE_TYPE_IDS } from './NodeTypeIds';
import { TransformNode, type TransformNodeOptions } from './TransformNode';

export interface CollisionRectNodeOptions extends TransformNodeOptions {}

export class CollisionRectNode extends TransformNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.CollisionRectNode;
  static override readonly sceneType = 'CollisionRectNode';

  constructor(options: CollisionRectNodeOptions = {}) {
    super({
      ...options,
      className: options.className ?? 'CollisionRectNode',
      sizeMode: options.sizeMode ?? 'explicit',
      boundsMode: options.boundsMode ?? 'content',
    });
  }

  get x(): number {
    return this.getWorldPosition().x;
  }

  get y(): number {
    return this.getWorldPosition().y;
  }

  setPosition(x: number, y: number): this {
    this.position = this.parent ? this.worldToLocalPosition({ x, y }) : { x, y };
    return this;
  }

  override getDebugBounds(): NodeDebugBounds | undefined {
    return this.getWorldBounds();
  }

  override getDebugProps(): NodeDebugProps {
    return {
      ...super.getDebugProps(),
      collisionX: this.x,
      collisionY: this.y,
      collisionWidth: this.size.width,
      collisionHeight: this.size.height,
    };
  }
}
