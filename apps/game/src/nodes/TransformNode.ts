import type Phaser from 'phaser';
import type { DebugNodePatch, DebugOverlayLayerDescriptor } from '@gravity-dig/debug-protocol';
import { GameNode, type DebugOverlayLayerRenderContext, type GameNodeOptions, type NodeDebugProps } from './GameNode';
import { NODE_TYPE_IDS } from './NodeTypeIds';
import { type Anchor, type PointLike, type SizeLike } from './Anchor';
import { exposedPropGroup, propAnchor, propBoolean, propNumber, propOrigin, propPosition, propScale, propSize, propString, type ExposedPropGroup } from './SceneProps';

function isPointPatchValue(value: DebugNodePatch[string]): value is PointLike {
  return typeof value === 'object' && value !== null && 'x' in value && 'y' in value;
}

function isSizePatchValue(value: DebugNodePatch[string]): value is SizeLike {
  return typeof value === 'object' && value !== null && 'width' in value && 'height' in value;
}

function roundScale(value: number): number {
  return Number(value.toFixed(2));
}

export interface TransformNodeOptions extends GameNodeOptions {
  visible?: boolean;
  scale?: number | PointLike;
  scaleX?: number;
  scaleY?: number;
  scrollFactor?: number;
}

export abstract class TransformNode extends GameNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.TransformNode;
  static override readonly sceneType: string = 'TransformNode';
  static override readonly debugOverlayLayers: readonly DebugOverlayLayerDescriptor[] = [
    { id: 'transform.bounds', label: 'Transform Bounds', source: 'TransformNode' },
    { id: 'transform.origin', label: 'Origin', source: 'TransformNode' },
    { id: 'transform.parentAnchor', label: 'Parent Anchor', source: 'TransformNode' },
  ];
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    ...GameNode.exposedPropGroups,
    exposedPropGroup('Presentation', {
      visible: propBoolean({ label: 'Visible' }),
    }),
    exposedPropGroup('Layout', {
      parentAnchor: propAnchor({ label: 'Parent Anchor' }),
      position: propPosition({ label: 'Position', step: 1 }),
      size: propSize({ label: 'Size', min: 0, step: 1 }),
      sizeMode: propString({ label: 'Size Mode' }),
    }),
    exposedPropGroup('Transform', {
      origin: propOrigin({ label: 'Origin', min: 0, max: 1, step: 0.01 }),
      rotation: propNumber({ label: 'Rotation', step: 0.01 }),
      scale: propScale({ label: 'Scale', step: 0.01 }),
    }),
  ];

  visible: boolean;
  scale: number;
  scaleX: number;
  scaleY: number;
  scrollFactor: number;

  protected constructor(options: TransformNodeOptions = {}) {
    super(options);
    this.visible = options.visible ?? true;
    const scale = typeof options.scale === 'object' ? options.scale : undefined;
    const uniformScale = typeof options.scale === 'number' ? options.scale : 1;
    this.scaleX = roundScale(scale?.x ?? options.scaleX ?? uniformScale);
    this.scaleY = roundScale(scale?.y ?? options.scaleY ?? uniformScale);
    this.scale = this.scaleX === this.scaleY ? this.scaleX : 1;
    this.scrollFactor = options.scrollFactor ?? 1;
  }

  override isDebugVisible(): boolean {
    return this.visible;
  }

  override getLocalScale(): { x: number; y: number } {
    return { x: this.scaleX, y: this.scaleY };
  }

  getPhaserTransform(): {
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    originX: number;
    originY: number;
    visible: boolean;
    scrollFactor: number;
  } {
    const position = this.getWorldPosition();
    const scale = this.getWorldScale();
    return {
      x: position.x,
      y: position.y,
      rotation: this.getWorldRotation(),
      scaleX: scale.x,
      scaleY: scale.y,
      originX: this.origin.x,
      originY: this.origin.y,
      visible: this.isEffectivelyActive() && this.visible,
      scrollFactor: this.scrollFactor,
    };
  }

  applyTransformTo<T extends Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Origin & Phaser.GameObjects.Components.Visible & Phaser.GameObjects.Components.ScrollFactor>(object: T): T {
    const transform = this.getPhaserTransform();
    object
      .setOrigin(transform.originX, transform.originY)
      .setPosition(transform.x, transform.y)
      .setRotation(transform.rotation)
      .setScale(transform.scaleX, transform.scaleY)
      .setVisible(transform.visible)
      .setScrollFactor(transform.scrollFactor);
    return object;
  }

  protected override renderDebugOverlayLayer({ graphics, layer, selected }: DebugOverlayLayerRenderContext): boolean {
    const bounds = this.getDebugBounds();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false;

    graphics.setVisible(true).setScrollFactor(bounds.scrollFactor ?? this.scrollFactor);

    if (layer.id === 'transform.bounds') {
      graphics
        .lineStyle(3, 0x38bdf8, 1)
        .strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
        .lineStyle(1, 0xffffff, 0.9)
        .strokeRect(bounds.x - 3, bounds.y - 3, bounds.width + 6, bounds.height + 6);
      return true;
    }

    if (layer.id === 'transform.parentAnchor') {
      const parentAnchor = this.getWorldParentAnchorPosition();
      if (!parentAnchor) return false;
      const nodeOrigin = this.getWorldOrigin();
      graphics
        .lineStyle(2, 0xfacc15, 0.9)
        .lineBetween(parentAnchor.x, parentAnchor.y, nodeOrigin.x, nodeOrigin.y)
        .lineStyle(3, 0xfacc15, 1)
        .strokeCircle(parentAnchor.x, parentAnchor.y, 11)
        .lineStyle(1, 0x020617, 0.95)
        .strokeCircle(parentAnchor.x, parentAnchor.y, 14)
        .lineStyle(2, 0xfacc15, 0.95)
        .lineBetween(parentAnchor.x - 15, parentAnchor.y, parentAnchor.x + 15, parentAnchor.y)
        .lineBetween(parentAnchor.x, parentAnchor.y - 15, parentAnchor.x, parentAnchor.y + 15);
      return true;
    }

    if (layer.id === 'transform.origin') {
      const nodeOrigin = this.getWorldOrigin();
      graphics
        .fillStyle(0xfb7185, 1)
        .fillCircle(nodeOrigin.x, nodeOrigin.y, 4)
        .lineStyle(2, 0x020617, 0.9)
        .strokeCircle(nodeOrigin.x, nodeOrigin.y, 6)
        .lineStyle(1, 0xfb7185, 0.95)
        .lineBetween(nodeOrigin.x - 8, nodeOrigin.y, nodeOrigin.x + 8, nodeOrigin.y)
        .lineBetween(nodeOrigin.x, nodeOrigin.y - 8, nodeOrigin.x, nodeOrigin.y + 8);
      return true;
    }

    return super.renderDebugOverlayLayer({ graphics, layer, selected });
  }

  override getDebugProps(): NodeDebugProps {
    const world = this.getWorldTransform();
    const contentBounds = this.getLocalContentBounds();
    return {
      ...super.getDebugProps(),
      visible: this.visible,
      sizeMode: this.sizeMode,
      boundsMode: this.boundsMode,
      debugScrollFactor: this.debugScrollFactor ?? null,
      parentAnchor: this.parent ? this.parentAnchor : null,
      localX: this.position.x,
      localY: this.position.y,
      localWidth: this.size.width,
      localHeight: this.size.height,
      originX: this.origin.x,
      originY: this.origin.y,
      rotation: this.rotation,
      worldX: world.x,
      worldY: world.y,
      worldRotation: world.rotation,
      contentX: contentBounds?.x ?? null,
      contentY: contentBounds?.y ?? null,
      contentWidth: contentBounds?.width ?? null,
      contentHeight: contentBounds?.height ?? null,
      scale: this.scale,
      localScaleX: this.getLocalScale().x,
      localScaleY: this.getLocalScale().y,
      scrollFactor: this.scrollFactor,
    };
  }

  protected override applySceneProp(key: string, value: DebugNodePatch[string]): boolean {
    switch (key) {
      case 'visible':
        if (typeof value !== 'boolean') return false;
        this.visible = value;
        this.refreshSubtreeActiveState();
        return true;
      case 'position':
        if (!isPointPatchValue(value)) return false;
        this.position = value;
        return true;
      case 'size':
        if (value === null) {
          this.sizeMode = 'content';
          return true;
        }
        if (!isSizePatchValue(value)) return false;
        this.size = value;
        this.sizeMode = 'explicit';
        return true;
      case 'sizeMode':
        if (value !== 'content' && value !== 'explicit') return false;
        this.sizeMode = value;
        return true;
      case 'parentAnchor':
        if (typeof value !== 'string') return false;
        this.parentAnchor = value as Anchor;
        return true;
      case 'origin':
        if (!isPointPatchValue(value)) return false;
        this.origin = value;
        return true;
      case 'rotation':
        if (typeof value !== 'number') return false;
        this.rotation = value;
        return true;
      case 'scale':
        if (typeof value !== 'object' || value === null || !('x' in value) || !('y' in value) || typeof value.x !== 'number' || typeof value.y !== 'number') return false;
        this.scaleX = roundScale(value.x);
        this.scaleY = roundScale(value.y);
        this.scale = this.scaleX === this.scaleY ? this.scaleX : 1;
        return true;
      case 'scaleX':
        if (typeof value !== 'number') return false;
        this.scaleX = roundScale(value);
        return true;
      case 'scaleY':
        if (typeof value !== 'number') return false;
        this.scaleY = roundScale(value);
        return true;
      case 'scrollFactor':
        if (typeof value !== 'number') return false;
        this.scrollFactor = value;
        return true;
      default:
        return super.applySceneProp(key, value);
    }
  }
}
