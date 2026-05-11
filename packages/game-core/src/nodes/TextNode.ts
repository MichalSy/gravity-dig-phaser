import Phaser from 'phaser';
import type { DebugNodePatch, DebugOverlayLayerDescriptor } from '@gravity-dig/debug-protocol';
import { type DebugOverlayLayerRenderContext, type NodeContext, type NodeDebugBounds, type NodeDebugProps } from './GameNode';
import { CORE_NODE_TYPE_IDS } from './NodeTypeIds';
import { exposedPropGroup, propFontId, propNumber, propString, type ExposedPropGroup } from './SceneProps';
import { TransformNode, type TransformNodeOptions } from './TransformNode';

const DEFAULT_FONT_FAMILY = 'Silkscreen';
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_COLOR = '#ffffff';

function textLocalSize(text: Phaser.GameObjects.Text): { width: number; height: number } {
  return { width: text.width, height: text.height };
}

function textLocalBounds(node: TextNode, text: Phaser.GameObjects.Text): NodeDebugBounds {
  const size = textLocalSize(text);
  return { x: -node.origin.x * size.width, y: -node.origin.y * size.height, width: size.width, height: size.height };
}

function normalizeFontSize(value: unknown, fallback = DEFAULT_FONT_SIZE): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace('px', ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export interface TextNodeOptions extends TransformNodeOptions {
  text?: string;
  fontFamily?: string;
  fontId?: string;
  fontSize?: number;
  fontStyle?: string;
  color?: string;
  stroke?: string;
  strokeThickness?: number;
  align?: string;
  style?: Phaser.Types.GameObjects.Text.TextStyle;
  resolution?: number;
}

export class TextNode extends TransformNode {
  static override readonly nodeTypeId: string = CORE_NODE_TYPE_IDS.TextNode;
  static override readonly sceneType: string = 'TextNode';
  static override readonly debugOverlayLayers: readonly DebugOverlayLayerDescriptor[] = [
    { id: 'text.visibleBounds', label: 'Text Visible Bounds', source: 'TextNode' },
  ];
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    ...TransformNode.exposedPropGroups,
    exposedPropGroup('Text', {
      text: propString({ label: 'Text' }),
      fontId: propFontId({ label: 'Font' }),
      fontFamily: propString({ label: 'Schriftart' }),
      fontSize: propNumber({ label: 'Schriftgröße', min: 1, step: 1 }),
      fontStyle: propString({ label: 'Schriftschnitt' }),
      color: propString({ label: 'Farbe' }),
      stroke: propString({ label: 'Konturfarbe' }),
      strokeThickness: propNumber({ label: 'Konturstärke', min: 0, step: 1 }),
      resolution: propNumber({ label: 'Render Resolution', min: 1, step: 1 }),
    }),
  ];

  text: string;
  fontId: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: string;
  color: string;
  stroke: string;
  strokeThickness: number;
  align: string;
  resolution?: number;
  private styleExtras: Phaser.Types.GameObjects.Text.TextStyle;
  protected phaserText?: Phaser.GameObjects.Text;

  constructor(options: TextNodeOptions = {}) {
    super({
      ...options,
      className: options.className ?? 'TextNode',
    });
    this.text = options.text ?? '';
    this.fontId = options.fontId ?? '';
    this.fontFamily = options.fontFamily ?? stringStyleValue(options.style?.fontFamily) ?? DEFAULT_FONT_FAMILY;
    this.fontSize = options.fontSize ?? normalizeFontSize(options.style?.fontSize);
    this.fontStyle = options.fontStyle ?? stringStyleValue(options.style?.fontStyle) ?? '';
    this.color = options.color ?? stringStyleValue(options.style?.color) ?? DEFAULT_COLOR;
    this.stroke = options.stroke ?? stringStyleValue(options.style?.stroke) ?? '#000000';
    this.strokeThickness = options.strokeThickness ?? normalizeFontSize(options.style?.strokeThickness, 0);
    this.align = options.align ?? stringStyleValue(options.style?.align) ?? 'left';
    this.resolution = options.resolution;
    this.styleExtras = { ...(options.style ?? {}) };
  }

  get object(): Phaser.GameObjects.Text {
    if (!this.phaserText) throw new Error(`TextNode '${this.debugName()}' has no Phaser text`);
    return this.phaserText;
  }

  init(ctx: NodeContext): void {
    this.phaserText = ctx.phaserScene.add.text(0, 0, this.text, this.buildTextStyle());
    if (this.resolution !== undefined) this.phaserText.setResolution(this.resolution);
    if (this.sizeMode === 'content') this.updateSizeFromText();
    this.applyTransformTo(this.phaserText);
  }

  override measureSelf(): void {
    if (!this.phaserText) return;
    this.applyTextContentAndStyle();
    if (this.sizeMode === 'content') this.updateSizeFromText();
  }

  override coreUpdate(): void {
    if (!this.phaserText) return;

    this.applyTextContentAndStyle();
    if (this.sizeMode === 'content') this.updateSizeFromText();
    this.applyTransformTo(this.phaserText);
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
    if (this.sizeMode === 'content') this.updateSizeFromText();
  }

  setFontFamily(fontFamily: string): void {
    this.fontFamily = fontFamily;
    this.applyTextContentAndStyle();
    if (this.sizeMode === 'content') this.updateSizeFromText();
  }

  setFontSize(fontSize: number): void {
    this.fontSize = fontSize;
    this.applyTextContentAndStyle();
    if (this.sizeMode === 'content') this.updateSizeFromText();
  }

  setStyle(style: Phaser.Types.GameObjects.Text.TextStyle): void {
    this.styleExtras = { ...this.styleExtras, ...style };
    this.fontFamily = stringStyleValue(style.fontFamily) ?? this.fontFamily;
    this.fontSize = normalizeFontSize(style.fontSize, this.fontSize);
    this.fontStyle = stringStyleValue(style.fontStyle) ?? this.fontStyle;
    this.color = stringStyleValue(style.color) ?? this.color;
    this.stroke = stringStyleValue(style.stroke) ?? this.stroke;
    this.strokeThickness = normalizeFontSize(style.strokeThickness, this.strokeThickness);
    this.align = stringStyleValue(style.align) ?? this.align;
    this.applyTextContentAndStyle();
    if (this.sizeMode === 'content') this.updateSizeFromText();
  }

  protected override getLocalContentBounds(): NodeDebugBounds | undefined {
    if (!this.phaserText) return super.getLocalContentBounds();
    if (this.sizeMode === 'content') return { ...textLocalBounds(this, this.phaserText), scrollFactor: this.getEffectiveScrollFactor() };
    return super.getLocalContentBounds();
  }

  protected override renderDebugOverlayLayer(ctx: DebugOverlayLayerRenderContext): boolean {
    if (ctx.layer.id !== 'text.visibleBounds') return super.renderDebugOverlayLayer(ctx);
    const bounds = this.getDebugBounds();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false;
    ctx.graphics
      .setVisible(true)
      .setScrollFactor(bounds.scrollFactor ?? this.getEffectiveScrollFactor())
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
      fontId: this.fontId,
      fontFamily: this.effectiveFontFamily(),
      fontSize: this.fontSize,
      fontStyle: this.fontStyle || null,
      color: this.color,
      stroke: this.stroke,
      strokeThickness: this.strokeThickness,
      resolution: this.resolution ?? null,
      scrollFactor: this.scrollFactor,
      effectiveScrollFactor: this.getEffectiveScrollFactor(),
    };
  }

  protected override applySceneProp(key: string, value: DebugNodePatch[string]): boolean {
    switch (key) {
      case 'text':
        if (typeof value !== 'string') return false;
        this.setText(value);
        return true;
      case 'fontId':
        if (typeof value !== 'string') return false;
        this.fontId = value;
        this.applyTextContentAndStyle();
        if (this.sizeMode === 'content') this.updateSizeFromText();
        return true;
      case 'fontFamily':
        if (typeof value !== 'string') return false;
        this.setFontFamily(value);
        return true;
      case 'fontSize':
        if (typeof value !== 'number') return false;
        this.setFontSize(value);
        return true;
      case 'fontStyle':
        if (typeof value !== 'string') return false;
        this.fontStyle = value;
        this.applyTextContentAndStyle();
        return true;
      case 'color':
        if (typeof value !== 'string') return false;
        this.color = value;
        this.applyTextContentAndStyle();
        return true;
      case 'stroke':
        if (typeof value !== 'string') return false;
        this.stroke = value;
        this.applyTextContentAndStyle();
        return true;
      case 'strokeThickness':
        if (typeof value !== 'number') return false;
        this.strokeThickness = value;
        this.applyTextContentAndStyle();
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

  private buildTextStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      ...this.styleExtras,
      fontFamily: this.effectiveFontFamily(),
      fontSize: `${this.fontSize}px`,
      fontStyle: this.fontStyle,
      color: this.color,
      stroke: this.stroke,
      strokeThickness: this.strokeThickness,
      align: this.align,
    };
  }

  private effectiveFontFamily(): string {
    return this.fontId ? this.assets.fontFamily(this.fontId) : this.fontFamily;
  }

  private applyTextContentAndStyle(): void {
    if (!this.phaserText) return;
    this.phaserText.setText(this.text);
    this.phaserText.setStyle(this.buildTextStyle());
    if (this.resolution !== undefined) this.phaserText.setResolution(this.resolution);
  }

  private updateSizeFromText(): void {
    if (!this.phaserText) return;
    this.size = textLocalSize(this.phaserText);
  }
}

function stringStyleValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
