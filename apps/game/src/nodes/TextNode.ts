import Phaser from 'phaser';
import type { DebugNodePatch, DebugOverlayLayerDescriptor } from '@gravity-dig/debug-protocol';
import { type DebugOverlayLayerRenderContext, type NodeContext, type NodeDebugBounds, type NodeDebugProps } from './GameNode';
import { NODE_TYPE_IDS } from './NodeTypeIds';
import { exposedPropGroup, propNumber, propString, type ExposedPropGroup } from './SceneProps';
import { TransformNode, type TransformNodeOptions } from './TransformNode';

function textLocalSize(text: Phaser.GameObjects.Text): { width: number; height: number } {
  return { width: text.width, height: text.height };
}

function textBoundsInParentSpace(node: TextNode, text: Phaser.GameObjects.Text): NodeDebugBounds {
  const size = textLocalSize(text);
  const originPosition = node.getPositionInParent();
  const originOffset = node.getLocalOriginOffset();
  const left = originPosition.x - originOffset.x * node.scaleX;
  const top = originPosition.y - originOffset.y * node.scaleY;
  return { x: left, y: top, width: size.width * Math.abs(node.scaleX), height: size.height * Math.abs(node.scaleY), scrollFactor: node.scrollFactor };
}

function textWorldBounds(text: Phaser.GameObjects.Text): NodeDebugBounds {
  const bounds = text.getBounds();
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}

export interface TextNodeOptions extends TransformNodeOptions {
  text?: string;
  style?: Phaser.Types.GameObjects.Text.TextStyle;
  resolution?: number;
}

export class TextNode extends TransformNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.TextNode;
  static override readonly sceneType: string = 'TextNode';
  static override readonly debugOverlayLayers: readonly DebugOverlayLayerDescriptor[] = [
    { id: 'text.visibleBounds', label: 'Text Visible Bounds', source: 'TextNode' },
  ];
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    ...TransformNode.exposedPropGroups,
    exposedPropGroup('Text', {
      text: propString({ label: 'Text' }),
      resolution: propNumber({ label: 'Resolution', min: 1, step: 1 }),
    }),
  ];

  text: string;
  style?: Phaser.Types.GameObjects.Text.TextStyle;
  resolution?: number;
  protected phaserText?: Phaser.GameObjects.Text;

  constructor(options: TextNodeOptions = {}) {
    super({
      ...options,
      className: options.className ?? 'TextNode',
      sizeMode: options.sizeMode ?? 'explicit',
    });
    this.text = options.text ?? '';
    this.style = options.style;
    this.resolution = options.resolution;
  }

  get object(): Phaser.GameObjects.Text {
    if (!this.phaserText) throw new Error(`TextNode '${this.debugName()}' has no Phaser text`);
    return this.phaserText;
  }

  init(ctx: NodeContext): void {
    this.phaserText = ctx.phaserScene.add.text(0, 0, this.text, this.style);
    this.applyTransformTo(this.phaserText);
    if (this.resolution !== undefined) this.phaserText.setResolution(this.resolution);
    this.updateSizeFromText();
  }

  update(): void {
    if (!this.phaserText) return;

    this.phaserText.setText(this.text);
    this.applyTransformTo(this.phaserText);
    if (this.resolution !== undefined) this.phaserText.setResolution(this.resolution);
    this.updateSizeFromText();
  }

  destroy(): void {
    this.phaserText?.destroy();
    this.phaserText = undefined;
  }

  protected override onEffectiveActiveChanged(active: boolean): void {
    this.phaserText?.setVisible(active && this.visible);
  }

  setText(text: string): void {
    this.text = text;
    this.phaserText?.setText(text);
    this.updateSizeFromText();
  }

  setStyle(style: Phaser.Types.GameObjects.Text.TextStyle): void {
    this.style = style;
    this.phaserText?.setStyle(style);
    this.updateSizeFromText();
  }

  override getBoundsInParentSpace(): NodeDebugBounds | undefined {
    if (!this.phaserText) return super.getBoundsInParentSpace();
    return textBoundsInParentSpace(this, this.phaserText);
  }

  override getWorldBounds(): NodeDebugBounds | undefined {
    return this.getDebugBounds();
  }

  override getDebugBounds(): NodeDebugBounds | undefined {
    if (!this.phaserText) return super.getDebugBounds();
    const bounds = textWorldBounds(this.phaserText);
    return { ...bounds, scrollFactor: this.scrollFactor };
  }

  protected override renderDebugOverlayLayer(ctx: DebugOverlayLayerRenderContext): boolean {
    if (ctx.layer.id !== 'text.visibleBounds') return super.renderDebugOverlayLayer(ctx);
    const bounds = this.getDebugBounds();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false;
    ctx.graphics
      .setVisible(true)
      .setScrollFactor(bounds.scrollFactor ?? this.scrollFactor)
      .lineStyle(2, 0xc084fc, 0.95)
      .strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
      .lineStyle(1, 0xf0abfc, 0.9)
      .lineBetween(bounds.x, bounds.y + bounds.height, bounds.x + bounds.width, bounds.y + bounds.height);
    return true;
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    return this.phaserText ? [this.phaserText, ...super.getSceneObjectsInHierarchy()] : super.getSceneObjectsInHierarchy();
  }

  override getDebugProps(): NodeDebugProps {
    return {
      ...super.getDebugProps(),
      text: this.text,
      scale: this.scale,
      localScaleX: this.getLocalScale().x,
      localScaleY: this.getLocalScale().y,
      displayWidth: this.phaserText?.displayWidth ?? null,
      displayHeight: this.phaserText?.displayHeight ?? null,
      fontFamily: stringStyleValue(this.phaserText?.style.fontFamily ?? this.style?.fontFamily),
      fontSize: stringStyleValue(this.phaserText?.style.fontSize ?? this.style?.fontSize),
      color: stringStyleValue(this.phaserText?.style.color ?? this.style?.color),
      scrollFactor: this.scrollFactor,
    };
  }

  protected override applySceneProp(key: string, value: DebugNodePatch[string]): boolean {
    switch (key) {
      case 'text':
        if (typeof value !== 'string') return false;
        this.setText(value);
        return true;
      case 'resolution':
        if (typeof value !== 'number') return false;
        this.resolution = value;
        if (this.phaserText) this.phaserText.setResolution(value);
        return true;
      default:
        return super.applySceneProp(key, value);
    }
  }

  private updateSizeFromText(): void {
    if (!this.phaserText) return;
    const size = textLocalSize(this.phaserText);
    this.size = size;
  }
}

function stringStyleValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
