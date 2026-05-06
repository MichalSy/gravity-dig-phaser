import Phaser from 'phaser';
import { anchorOrigin } from './Anchor';
import { type NodeContext, type NodeDebugBounds, type NodeDebugProps } from './GameNode';
import { TransformNode, type TransformNodeOptions } from './TransformNode';

function textLocalSize(text: Phaser.GameObjects.Text): { width: number; height: number } {
  return { width: text.width, height: text.height };
}

function textBoundsInParentSpace(node: TextNode, text: Phaser.GameObjects.Text): NodeDebugBounds {
  const size = textLocalSize(text);
  const anchorPosition = node.getPositionInParent();
  const left = anchorPosition.x - text.originX * size.width * node.scaleX;
  const top = anchorPosition.y - text.originY * size.height * node.scaleY;
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
  text: string;
  style?: Phaser.Types.GameObjects.Text.TextStyle;
  resolution?: number;
  protected phaserText?: Phaser.GameObjects.Text;

  constructor(options: TextNodeOptions = {}) {
    const defaultOrigin = anchorOrigin('top-left');
    super({
      ...options,
      className: options.className ?? 'TextNode',
      origin: { x: options.origin?.x ?? defaultOrigin.x, y: options.origin?.y ?? defaultOrigin.y },
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
    const worldPosition = this.getWorldPosition();
    const worldScale = this.getWorldScale();
    this.phaserText = ctx.phaserScene.add
      .text(worldPosition.x, worldPosition.y, this.text, this.style)
      .setDepth(this.depth)
      .setScale(worldScale.x, worldScale.y)
      .setVisible(this.visible)
      .setScrollFactor(this.scrollFactor)
      .setOrigin(this.origin.x, this.origin.y);
    if (this.resolution !== undefined) this.phaserText.setResolution(this.resolution);
    this.updateSizeFromText();
  }

  update(): void {
    if (!this.phaserText) return;

    const worldPosition = this.getWorldPosition();
    const worldScale = this.getWorldScale();
    this.phaserText
      .setText(this.text)
      .setPosition(worldPosition.x, worldPosition.y)
      .setDepth(this.depth)
      .setRotation(this.getWorldRotation())
      .setScale(worldScale.x, worldScale.y)
      .setVisible(this.visible)
      .setScrollFactor(this.scrollFactor)
      .setOrigin(this.origin.x, this.origin.y);
    if (this.resolution !== undefined) this.phaserText.setResolution(this.resolution);
    this.updateSizeFromText();
  }

  destroy(): void {
    this.phaserText?.destroy();
    this.phaserText = undefined;
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

  override getDebugProps(): NodeDebugProps {
    return {
      ...super.getDebugProps(),
      text: this.text,
      depth: this.depth,
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

  private updateSizeFromText(): void {
    if (!this.phaserText) return;
    const size = textLocalSize(this.phaserText);
    this.size = size;
  }
}

function stringStyleValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
