import type { DebugOverlayLayerDescriptor } from '@gravity-dig/debug-protocol';
import type { DebugOverlayLayerRenderContext, NodeDebugBounds, NodeDebugProps } from './GameNode';
import { NODE_TYPE_IDS } from './NodeTypeIds';
import { TransformNode, type TransformNodeOptions } from './TransformNode';

export interface CollisionRectNodeOptions extends TransformNodeOptions {}

export class CollisionRectNode extends TransformNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.CollisionRectNode;
  static override readonly sceneType = 'CollisionRectNode';
  static override readonly debugOverlayLayers: readonly DebugOverlayLayerDescriptor[] = [
    { id: 'collision.rect', label: 'Collision Rect', source: 'CollisionRectNode' },
  ];

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

  protected override renderDebugOverlayLayer(ctx: DebugOverlayLayerRenderContext): boolean {
    if (ctx.layer.id !== 'collision.rect') return super.renderDebugOverlayLayer(ctx);
    const bounds = this.getDebugBounds();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false;
    ctx.graphics
      .setVisible(true)
      .setScrollFactor(bounds.scrollFactor ?? this.scrollFactor)
      .lineStyle(2, 0xef4444, 0.95)
      .strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
      .lineStyle(1, 0xfca5a5, 0.85)
      .lineBetween(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height)
      .lineBetween(bounds.x + bounds.width, bounds.y, bounds.x, bounds.y + bounds.height);
    return true;
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
