import Phaser from 'phaser';
import type { DebugNodePatch } from '@gravity-dig/debug-protocol';
import type { PointLike } from './Anchor';
import { type NodeContext, type NodeDebugBounds, type NodeDebugProps } from './GameNode';
import { CORE_NODE_TYPE_IDS } from './NodeTypeIds';
import { exposedPropGroup, propColor, propNumber, propPosition, type ExposedPropGroup } from './SceneProps';
import { TransformNode, type TransformNodeOptions } from './TransformNode';

export interface LineNodeOptions extends TransformNodeOptions {
  start?: PointLike;
  end?: PointLike;
  color?: string;
  lineWidth?: number;
  alpha?: number;
}

export class LineNode extends TransformNode {
  static override readonly nodeTypeId: string = CORE_NODE_TYPE_IDS.LineNode;
  static override readonly sceneType = 'LineNode';
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    ...TransformNode.exposedPropGroups,
    exposedPropGroup('Line', {
      start: propPosition({ label: 'Start', step: 1 }),
      end: propPosition({ label: 'End', step: 1 }),
      color: propColor({ label: 'Color' }),
      lineWidth: propNumber({ label: 'Width', min: 0, step: 1 }),
      alpha: propNumber({ label: 'Alpha', min: 0, max: 1, step: 0.05 }),
    }),
  ];

  start: PointLike;
  end: PointLike;
  color: string;
  lineWidth: number;
  alpha: number;
  private graphics?: Phaser.GameObjects.Graphics;

  constructor(options: LineNodeOptions = {}) {
    super({ ...options, className: options.className ?? 'LineNode', sizeMode: options.sizeMode ?? 'content' });
    this.start = { ...(options.start ?? { x: 0, y: 0 }) };
    this.end = { ...(options.end ?? { x: 0, y: 0 }) };
    this.color = options.color ?? '#ffffff';
    this.lineWidth = options.lineWidth ?? 1;
    this.alpha = options.alpha ?? 1;
  }

  init(ctx: NodeContext): void {
    this.graphics = ctx.phaserScene.add.graphics();
    this.redraw();
  }

  override coreUpdate(): void {
    this.redraw();
  }

  setPoints(start: PointLike, end: PointLike): void {
    this.start = { x: start.x, y: start.y };
    this.end = { x: end.x, y: end.y };
    this.invalidateMeasure();
    this.redraw();
  }

  clear(): void {
    this.graphics?.clear();
  }

  destroy(): void {
    this.graphics?.destroy();
    this.graphics = undefined;
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    return this.graphics ? [this.graphics, ...super.getSceneObjectsInHierarchy()] : super.getSceneObjectsInHierarchy();
  }

  override getDebugProps(): NodeDebugProps {
    return {
      ...super.getDebugProps(),
      startX: this.start.x,
      startY: this.start.y,
      endX: this.end.x,
      endY: this.end.y,
      color: this.color,
      lineWidth: this.lineWidth,
      alpha: this.alpha,
    };
  }

  protected override getLocalContentBounds(): NodeDebugBounds {
    const halfWidth = this.lineWidth / 2;
    const minX = Math.min(this.start.x, this.end.x) - halfWidth;
    const minY = Math.min(this.start.y, this.end.y) - halfWidth;
    return {
      x: minX,
      y: minY,
      width: Math.abs(this.end.x - this.start.x) + this.lineWidth,
      height: Math.abs(this.end.y - this.start.y) + this.lineWidth,
      scrollFactor: this.getEffectiveScrollFactor(),
    };
  }

  protected override applySceneProp(key: string, value: DebugNodePatch[string]): boolean {
    switch (key) {
      case 'start':
      case 'end':
        if (!isPoint(value)) return false;
        this[key] = { x: value.x, y: value.y };
        this.invalidateMeasure();
        this.redraw();
        return true;
      case 'color':
        if (typeof value !== 'string') return false;
        this.color = value;
        this.redraw();
        return true;
      case 'lineWidth':
        if (typeof value !== 'number') return false;
        this.lineWidth = Math.max(0, value);
        this.invalidateMeasure();
        this.redraw();
        return true;
      case 'alpha':
        if (typeof value !== 'number') return false;
        this.alpha = Phaser.Math.Clamp(value, 0, 1);
        this.redraw();
        return true;
      default:
        return super.applySceneProp(key, value);
    }
  }

  private redraw(): void {
    if (!this.graphics) return;
    const transform = this.getPhaserTransform();
    this.graphics
      .clear()
      .setPosition(transform.x, transform.y)
      .setRotation(transform.rotation)
      .setScale(transform.scaleX, transform.scaleY)
      .setScrollFactor(transform.scrollFactor)
      .setVisible(transform.visible);
    if (!transform.visible || this.lineWidth <= 0 || this.alpha <= 0) return;
    this.graphics
      .lineStyle(this.lineWidth, parseColor(this.color), this.alpha)
      .lineBetween(this.start.x, this.start.y, this.end.x, this.end.y);
  }
}

function parseColor(value: string): number {
  return Phaser.Display.Color.HexStringToColor(value).color;
}

function isPoint(value: unknown): value is PointLike {
  return typeof value === 'object' && value !== null && 'x' in value && 'y' in value
    && typeof (value as PointLike).x === 'number' && typeof (value as PointLike).y === 'number';
}
