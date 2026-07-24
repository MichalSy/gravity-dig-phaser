import Phaser from 'phaser';
import type { DebugNodePatch } from '@gravity-dig/debug-protocol';
import { type NodeContext, type NodeDebugProps } from './GameNode';
import { CORE_NODE_TYPE_IDS } from './NodeTypeIds';
import { exposedPropGroup, propColor, propNumber, type ExposedPropGroup } from './SceneProps';
import { TransformNode, type TransformNodeOptions } from './TransformNode';

export interface RoundedRectangleNodeOptions extends TransformNodeOptions {
  fillColor?: string;
  fillAlpha?: number;
  strokeColor?: string;
  strokeAlpha?: number;
  strokeWidth?: number;
  radius?: number;
}

export class RoundedRectangleNode extends TransformNode {
  static override readonly nodeTypeId: string = CORE_NODE_TYPE_IDS.RoundedRectangleNode;
  static override readonly sceneType = 'RoundedRectangleNode';
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    ...TransformNode.exposedPropGroups,
    exposedPropGroup('Rounded Rectangle', {
      fillColor: propColor({ label: 'Fill Color' }),
      fillAlpha: propNumber({ label: 'Fill Alpha', min: 0, max: 1, step: 0.05 }),
      strokeColor: propColor({ label: 'Stroke Color' }),
      strokeAlpha: propNumber({ label: 'Stroke Alpha', min: 0, max: 1, step: 0.05 }),
      strokeWidth: propNumber({ label: 'Stroke Width', min: 0, step: 1 }),
      radius: propNumber({ label: 'Corner Radius', min: 0, step: 1 }),
    }),
  ];

  fillColor: string;
  fillAlpha: number;
  strokeColor: string;
  strokeAlpha: number;
  strokeWidth: number;
  radius: number;
  private graphics?: Phaser.GameObjects.Graphics;
  private presentationKey = '';

  constructor(options: RoundedRectangleNodeOptions = {}) {
    super({ ...options, className: options.className ?? 'RoundedRectangleNode', sizeMode: options.sizeMode ?? 'explicit' });
    this.fillColor = options.fillColor ?? '#ffffff';
    this.fillAlpha = options.fillAlpha ?? 0;
    this.strokeColor = options.strokeColor ?? '#ffffff';
    this.strokeAlpha = options.strokeAlpha ?? 1;
    this.strokeWidth = options.strokeWidth ?? 0;
    this.radius = options.radius ?? 0;
  }

  init(ctx: NodeContext): void {
    this.graphics = ctx.phaserScene.add.graphics();
    this.presentationKey = '';
    this.redrawIfNeeded();
    this.applyGraphicsTransform();
  }

  override coreUpdate(): void {
    this.redrawIfNeeded();
    this.applyGraphicsTransform();
  }

  destroy(): void {
    this.graphics?.destroy();
    this.graphics = undefined;
    this.presentationKey = '';
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    return this.graphics ? [this.graphics, ...super.getSceneObjectsInHierarchy()] : super.getSceneObjectsInHierarchy();
  }

  override getDebugProps(): NodeDebugProps {
    return {
      ...super.getDebugProps(),
      fillColor: this.fillColor,
      fillAlpha: this.fillAlpha,
      strokeColor: this.strokeColor,
      strokeAlpha: this.strokeAlpha,
      strokeWidth: this.strokeWidth,
      radius: this.radius,
    };
  }

  protected override applySceneProp(key: string, value: DebugNodePatch[string]): boolean {
    switch (key) {
      case 'fillColor':
      case 'strokeColor':
        if (typeof value !== 'string') return false;
        this[key] = value;
        this.redrawIfNeeded();
        return true;
      case 'fillAlpha':
      case 'strokeAlpha':
        if (typeof value !== 'number') return false;
        this[key] = Phaser.Math.Clamp(value, 0, 1);
        this.redrawIfNeeded();
        return true;
      case 'strokeWidth':
        if (typeof value !== 'number') return false;
        this.strokeWidth = Math.max(0, value);
        this.redrawIfNeeded();
        return true;
      case 'radius':
        if (typeof value !== 'number') return false;
        this.radius = Math.max(0, value);
        this.redrawIfNeeded();
        return true;
      default:
        return super.applySceneProp(key, value);
    }
  }

  private redrawIfNeeded(): void {
    if (!this.graphics) return;
    const key = [
      this.size.width,
      this.size.height,
      this.origin.x,
      this.origin.y,
      this.fillColor,
      this.fillAlpha,
      this.strokeColor,
      this.strokeAlpha,
      this.strokeWidth,
      this.radius,
    ].join('|');
    if (key === this.presentationKey) return;
    this.presentationKey = key;
    const width = this.size.width;
    const height = this.size.height;
    const x = -width * this.origin.x;
    const y = -height * this.origin.y;
    const radius = Math.min(this.radius, width * 0.5, height * 0.5);
    this.graphics.clear();
    if (this.fillAlpha > 0) {
      this.graphics.fillStyle(parseColor(this.fillColor), this.fillAlpha).fillRoundedRect(x, y, width, height, radius);
    }
    if (this.strokeWidth > 0 && this.strokeAlpha > 0) {
      this.graphics.lineStyle(this.strokeWidth, parseColor(this.strokeColor), this.strokeAlpha)
        .strokeRoundedRect(x, y, width, height, radius);
    }
  }

  private applyGraphicsTransform(): void {
    if (!this.graphics) return;
    const transform = this.getPhaserTransform();
    this.graphics
      .setPosition(transform.x, transform.y)
      .setRotation(transform.rotation)
      .setScale(transform.scaleX, transform.scaleY)
      .setVisible(transform.visible)
      .setScrollFactor(transform.scrollFactor);
  }
}

function parseColor(value: string): number {
  return Phaser.Display.Color.HexStringToColor(value).color;
}
