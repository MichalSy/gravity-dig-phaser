import Phaser from 'phaser';
import type { DebugNodePatch } from '@gravity-dig/debug-protocol';
import { type NodeContext, type NodeDebugProps } from './GameNode';
import { CORE_NODE_TYPE_IDS } from './NodeTypeIds';
import { exposedPropGroup, propColor, propNumber, type ExposedPropGroup } from './SceneProps';
import { TransformNode, type TransformNodeOptions } from './TransformNode';

export interface RectangleNodeOptions extends TransformNodeOptions {
  fillColor?: string;
  fillAlpha?: number;
  strokeColor?: string;
  strokeAlpha?: number;
  strokeWidth?: number;
}

export class RectangleNode extends TransformNode {
  static override readonly nodeTypeId: string = CORE_NODE_TYPE_IDS.RectangleNode;
  static override readonly sceneType = 'RectangleNode';
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    ...TransformNode.exposedPropGroups,
    exposedPropGroup('Rectangle', {
      fillColor: propColor({ label: 'Fill Color' }),
      fillAlpha: propNumber({ label: 'Fill Alpha', min: 0, max: 1, step: 0.05 }),
      strokeColor: propColor({ label: 'Stroke Color' }),
      strokeAlpha: propNumber({ label: 'Stroke Alpha', min: 0, max: 1, step: 0.05 }),
      strokeWidth: propNumber({ label: 'Stroke Width', min: 0, step: 1 }),
    }),
  ];

  fillColor: string;
  fillAlpha: number;
  strokeColor: string;
  strokeAlpha: number;
  strokeWidth: number;
  private rectangle?: Phaser.GameObjects.Rectangle;

  constructor(options: RectangleNodeOptions = {}) {
    super({ ...options, className: options.className ?? 'RectangleNode', sizeMode: options.sizeMode ?? 'explicit' });
    this.fillColor = options.fillColor ?? '#ffffff';
    this.fillAlpha = options.fillAlpha ?? 0;
    this.strokeColor = options.strokeColor ?? '#ffffff';
    this.strokeAlpha = options.strokeAlpha ?? 1;
    this.strokeWidth = options.strokeWidth ?? 0;
  }

  init(ctx: NodeContext): void {
    this.rectangle = ctx.phaserScene.add.rectangle(0, 0, this.size.width, this.size.height);
    this.applyPresentation();
  }

  override coreUpdate(): void {
    this.applyPresentation();
  }

  destroy(): void {
    this.rectangle?.destroy();
    this.rectangle = undefined;
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    return this.rectangle ? [this.rectangle, ...super.getSceneObjectsInHierarchy()] : super.getSceneObjectsInHierarchy();
  }

  override getDebugProps(): NodeDebugProps {
    return {
      ...super.getDebugProps(),
      fillColor: this.fillColor,
      fillAlpha: this.fillAlpha,
      strokeColor: this.strokeColor,
      strokeAlpha: this.strokeAlpha,
      strokeWidth: this.strokeWidth,
    };
  }

  protected override applySceneProp(key: string, value: DebugNodePatch[string]): boolean {
    switch (key) {
      case 'fillColor':
      case 'strokeColor':
        if (typeof value !== 'string') return false;
        this[key] = value;
        this.applyPresentation();
        return true;
      case 'fillAlpha':
      case 'strokeAlpha':
        if (typeof value !== 'number') return false;
        this[key] = Phaser.Math.Clamp(value, 0, 1);
        this.applyPresentation();
        return true;
      case 'strokeWidth':
        if (typeof value !== 'number') return false;
        this.strokeWidth = Math.max(0, value);
        this.applyPresentation();
        return true;
      default:
        return super.applySceneProp(key, value);
    }
  }

  private applyPresentation(): void {
    if (!this.rectangle) return;
    this.rectangle
      .setSize(this.size.width, this.size.height)
      .setDisplaySize(this.size.width, this.size.height)
      .setFillStyle(parseColor(this.fillColor), this.fillAlpha)
      .setStrokeStyle(this.strokeWidth, parseColor(this.strokeColor), this.strokeAlpha);
    this.applyTransformTo(this.rectangle);
  }
}

function parseColor(value: string): number {
  return Phaser.Display.Color.HexStringToColor(value).color;
}
