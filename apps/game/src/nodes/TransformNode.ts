import type Phaser from 'phaser';
import type { DebugNodePatch } from '@gravity-dig/debug-protocol';
import { GameNode, type GameNodeOptions } from './GameNode';
import { exposedPropGroup, propNumber, propOrigin, propScale, type ExposedPropGroup } from './SceneProps';

export interface TransformNodeOptions extends GameNodeOptions {
  depth?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  scrollFactor?: number;
}

export abstract class TransformNode extends GameNode {
  static override readonly sceneType: string = 'TransformNode';
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    ...GameNode.exposedPropGroups,
    exposedPropGroup('Transform', {
      origin: propOrigin({ label: 'Origin', min: 0, max: 1, step: 0.01 }),
      rotation: propNumber({ label: 'Rotation', step: 0.01 }),
      scale: propScale({ label: 'Scale', step: 0.01 }),
    }),
  ];

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


  getRenderOriginWorldPosition(): { x: number; y: number } {
    return this.getWorldRenderOriginPosition();
  }

  getPhaserTransform(): {
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    originX: number;
    originY: number;
    depth: number;
    visible: boolean;
    scrollFactor: number;
  } {
    const position = this.getRenderOriginWorldPosition();
    const scale = this.getWorldScale();
    return {
      x: position.x,
      y: position.y,
      rotation: this.getWorldRotation(),
      scaleX: scale.x,
      scaleY: scale.y,
      originX: this.origin.x,
      originY: this.origin.y,
      depth: this.depth,
      visible: this.visible,
      scrollFactor: this.scrollFactor,
    };
  }

  applyTransformTo<T extends Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Origin & Phaser.GameObjects.Components.Depth & Phaser.GameObjects.Components.Visible & Phaser.GameObjects.Components.ScrollFactor>(object: T): T {
    const transform = this.getPhaserTransform();
    object
      .setOrigin(transform.originX, transform.originY)
      .setPosition(transform.x, transform.y)
      .setRotation(transform.rotation)
      .setScale(transform.scaleX, transform.scaleY)
      .setDepth(transform.depth)
      .setVisible(transform.visible)
      .setScrollFactor(transform.scrollFactor);
    return object;
  }

  protected override applySceneProp(key: string, value: DebugNodePatch[string]): boolean {
    switch (key) {
      case 'depth':
        if (typeof value !== 'number') return false;
        this.depth = value;
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
