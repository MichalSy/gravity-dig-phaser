import type Phaser from 'phaser';
import type { DebugNodePatch } from '@gravity-dig/debug-protocol';
import { GameNode, type GameNodeOptions, type NodeDebugProps } from './GameNode';
import { type Anchor, type PointLike, type SizeLike } from './Anchor';
import { exposedPropGroup, propAnchor, propBoolean, propNumber, propOrigin, propPosition, propScale, propSize, type ExposedPropGroup } from './SceneProps';

function isPointPatchValue(value: DebugNodePatch[string]): value is PointLike {
  return typeof value === 'object' && value !== null && 'x' in value && 'y' in value;
}

function isSizePatchValue(value: DebugNodePatch[string]): value is SizeLike {
  return typeof value === 'object' && value !== null && 'width' in value && 'height' in value;
}

export interface TransformNodeOptions extends GameNodeOptions {
  visible?: boolean;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  scrollFactor?: number;
}

export abstract class TransformNode extends GameNode {
  static override readonly sceneType: string = 'TransformNode';
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    ...GameNode.exposedPropGroups,
    exposedPropGroup('Presentation', {
      visible: propBoolean({ label: 'Visible' }),
    }),
    exposedPropGroup('Layout', {
      parentAnchor: propAnchor({ label: 'Parent Anchor' }),
      position: propPosition({ label: 'Position', step: 1 }),
      size: propSize({ label: 'Size', min: 0, step: 1 }),
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
    this.scale = options.scale ?? 1;
    this.scaleX = options.scaleX ?? this.scale;
    this.scaleY = options.scaleY ?? this.scale;
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
        if (!isSizePatchValue(value)) return false;
        this.size = value;
        this.sizeMode = 'explicit';
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
        this.scale = value.x === value.y ? value.x : 1;
        this.scaleX = value.x;
        this.scaleY = value.y;
        return true;
      case 'scaleX':
        if (typeof value !== 'number') return false;
        this.scaleX = value;
        return true;
      case 'scaleY':
        if (typeof value !== 'number') return false;
        this.scaleY = value;
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
