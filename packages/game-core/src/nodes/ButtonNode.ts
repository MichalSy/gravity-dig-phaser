import Phaser from 'phaser';
import type { DebugNodePatch, DebugOverlayLayerDescriptor } from '@gravity-dig/debug-protocol';
import { isFrameAsset, type RenderableImageAsset } from '../assets/imageAssets';
import { type DebugOverlayLayerRenderContext, type NodeContext, type NodeDebugBounds, type NodeDebugProps } from './GameNode';
import { CORE_NODE_TYPE_IDS } from './NodeTypeIds';
import { exposedPropGroup, propAssetId, propBoolean, propFontId, propNumber, propString, type ExposedPropGroup } from './SceneProps';
import { TransformNode, type TransformNodeOptions } from './TransformNode';

const DEFAULT_BUTTON_WIDTH = 220;
const DEFAULT_BUTTON_HEIGHT = 64;
const DEFAULT_NORMAL_COLOR = 0x334155;
const DEFAULT_ACTIVE_COLOR = 0x475569;
const DEFAULT_DISABLED_ALPHA = 0.45;
const DEFAULT_LABEL_COLOR = '#ffffff';
const DEFAULT_LABEL_FONT_FAMILY = 'Arial, sans-serif';
const DEFAULT_LABEL_FONT_SIZE = 18;
const DEFAULT_FLASH_TINT = 0xfff1a8;

export interface ButtonNodeOptions extends TransformNodeOptions {
  action?: string;
  label?: string;
  enabled?: boolean;
  normalAssetId?: string;
  activeAssetId?: string;
  selected?: boolean;
  labelOffsetY?: number;
  fontId?: string;
  fontSize?: number;
}

type ButtonCallback = (button: ButtonNode) => void;
type ButtonBackground = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;

function imageLocalSize(image: Phaser.GameObjects.Image): { width: number; height: number } {
  return { width: image.frame.width, height: image.frame.height };
}

function backgroundLocalSize(node: ButtonNode, background: ButtonBackground): { width: number; height: number } {
  if (background instanceof Phaser.GameObjects.Image) return imageLocalSize(background);
  return {
    width: node.size.width > 0 ? node.size.width : DEFAULT_BUTTON_WIDTH,
    height: node.size.height > 0 ? node.size.height : DEFAULT_BUTTON_HEIGHT,
  };
}

function backgroundLocalBounds(node: ButtonNode, background: ButtonBackground): NodeDebugBounds {
  const size = backgroundLocalSize(node, background);
  return { x: -node.origin.x * size.width, y: -node.origin.y * size.height, width: size.width, height: size.height, scrollFactor: node.scrollFactor };
}

function rotatedOffset(offsetX: number, offsetY: number, scale: { x: number; y: number }, rotation: number): { x: number; y: number } {
  const x = offsetX * scale.x;
  const y = offsetY * scale.y;
  if (rotation === 0) return { x, y };
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

export class ButtonNode extends TransformNode {
  static override readonly nodeTypeId: string = CORE_NODE_TYPE_IDS.ButtonNode;
  static override readonly sceneType: string = 'ButtonNode';
  static override readonly debugOverlayLayers: readonly DebugOverlayLayerDescriptor[] = [
    { id: 'button.bounds', label: 'Button Bounds', source: 'ButtonNode' },
  ];
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    ...TransformNode.exposedPropGroups,
    exposedPropGroup('Button', {
      action: propString({ label: 'Action' }),
      label: propString({ label: 'Label' }),
      enabled: propBoolean({ label: 'Enabled' }),
      selected: propBoolean({ label: 'Selected' }),
      normalAssetId: propAssetId({ label: 'Normal Image' }),
      activeAssetId: propAssetId({ label: 'Active Image' }),
      labelOffsetY: propNumber({ label: 'Label Offset Y', step: 1 }),
      fontId: propFontId({ label: 'Font' }),
      fontSize: propNumber({ label: 'Font Size', min: 1, step: 1 }),
    }),
  ];

  action: string;
  label: string;
  enabled: boolean;
  selected: boolean;
  normalAssetId: string;
  activeAssetId: string;
  labelOffsetY: number;
  fontId: string;
  fontSize: number;

  private normalAsset?: RenderableImageAsset;
  private activeAsset?: RenderableImageAsset;
  private background?: ButtonBackground;
  private phaserLabel?: Phaser.GameObjects.Text;
  private hoverCallback?: ButtonCallback;
  private activateCallback?: ButtonCallback;
  private flashUntil = 0;

  constructor(options: ButtonNodeOptions = {}) {
    super({
      ...options,
      className: options.className ?? 'ButtonNode',
      origin: options.origin ?? { x: 0.5, y: 0.5 },
    });
    this.action = options.action ?? '';
    this.label = options.label ?? '';
    this.enabled = options.enabled ?? true;
    this.selected = options.selected ?? false;
    this.normalAssetId = options.normalAssetId ?? '';
    this.activeAssetId = options.activeAssetId ?? '';
    this.labelOffsetY = options.labelOffsetY ?? 0;
    this.fontId = options.fontId ?? '';
    this.fontSize = options.fontSize ?? DEFAULT_LABEL_FONT_SIZE;
  }

  init(ctx: NodeContext): void {
    this.normalAsset = this.normalAssetId ? ctx.assets.image(this.normalAssetId) : undefined;
    this.activeAsset = this.activeAssetId ? ctx.assets.image(this.activeAssetId) : undefined;
    const asset = this.currentAsset();
    this.background = asset
      ? ctx.phaserScene.add.image(0, 0, asset.textureKey, isFrameAsset(asset) ? asset.frameKey : undefined)
      : ctx.phaserScene.add.rectangle(0, 0, this.size.width || DEFAULT_BUTTON_WIDTH, this.size.height || DEFAULT_BUTTON_HEIGHT, DEFAULT_NORMAL_COLOR);
    this.phaserLabel = ctx.phaserScene.add.text(0, 0, this.label, {
      color: DEFAULT_LABEL_COLOR,
      align: 'center',
      fontFamily: this.labelFontFamily(ctx),
      fontSize: `${this.fontSize}px`,
    }).setOrigin(0.5).setResolution(2);
    this.configureInteractivity();
    if (this.sizeMode === 'content') this.size = backgroundLocalSize(this, this.background);
    this.applyButtonState();
    this.applyButtonTransform();
  }

  override measureSelf(): void {
    if (this.background && this.sizeMode === 'content') this.size = backgroundLocalSize(this, this.background);
  }

  override coreUpdate(): void {
    this.applyButtonState();
    this.applyButtonTransform();
  }

  destroy(): void {
    this.background?.destroy();
    this.phaserLabel?.destroy();
    this.background = undefined;
    this.phaserLabel = undefined;
  }

  setCallbacks(callbacks: { onHover?: ButtonCallback; onActivate?: ButtonCallback }): void {
    this.hoverCallback = callbacks.onHover;
    this.activateCallback = callbacks.onActivate;
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.applyButtonState();
  }

  flash(durationMs = 300): void {
    this.flashUntil = performance.now() + durationMs;
    this.applyButtonState();
  }

  protected override onEffectiveActiveChanged(active: boolean): void {
    this.background?.setVisible(active && this.visible);
    this.phaserLabel?.setVisible(active && this.visible);
  }

  protected override getLocalContentBounds(): NodeDebugBounds | undefined {
    if (!this.background) return super.getLocalContentBounds();
    return backgroundLocalBounds(this, this.background);
  }

  protected override renderDebugOverlayLayer(ctx: DebugOverlayLayerRenderContext): boolean {
    if (ctx.layer.id !== 'button.bounds') return super.renderDebugOverlayLayer(ctx);
    const bounds = this.getDebugBounds();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false;
    ctx.graphics
      .setVisible(true)
      .setScrollFactor(bounds.scrollFactor ?? this.getEffectiveScrollFactor())
      .lineStyle(2, this.selected ? 0xfacc15 : 0x38bdf8, 0.95)
      .strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    return true;
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    const objects: Phaser.GameObjects.GameObject[] = [];
    if (this.background) objects.push(this.background);
    if (this.phaserLabel) objects.push(this.phaserLabel);
    return objects;
  }

  override getDebugProps(): NodeDebugProps {
    return {
      ...super.getDebugProps(),
      action: this.action,
      label: this.label,
      enabled: this.enabled,
      selected: this.selected,
      normalAssetId: this.normalAssetId,
      activeAssetId: this.activeAssetId,
      labelOffsetY: this.labelOffsetY,
      fontId: this.fontId,
      fontSize: this.fontSize,
      scrollFactor: this.scrollFactor,
      effectiveScrollFactor: this.getEffectiveScrollFactor(),
    };
  }

  protected override applySceneProp(key: string, value: DebugNodePatch[string]): boolean {
    switch (key) {
      case 'action':
        if (typeof value !== 'string') return false;
        this.action = value;
        return true;
      case 'label':
        if (typeof value !== 'string') return false;
        this.label = value;
        this.phaserLabel?.setText(value);
        return true;
      case 'enabled':
        if (typeof value !== 'boolean') return false;
        this.enabled = value;
        this.configureInteractivity();
        return true;
      case 'selected':
        if (typeof value !== 'boolean') return false;
        this.selected = value;
        return true;
      case 'normalAssetId':
        if (typeof value !== 'string') return false;
        this.normalAssetId = value;
        this.normalAsset = value ? this.assets.image(value) : undefined;
        return true;
      case 'activeAssetId':
        if (typeof value !== 'string') return false;
        this.activeAssetId = value;
        this.activeAsset = value ? this.assets.image(value) : undefined;
        return true;
      case 'labelOffsetY':
        if (typeof value !== 'number') return false;
        this.labelOffsetY = value;
        return true;
      case 'fontId':
        if (typeof value !== 'string') return false;
        this.fontId = value;
        this.applyLabelStyle();
        return true;
      case 'fontSize':
        if (typeof value !== 'number') return false;
        this.fontSize = value;
        this.applyLabelStyle();
        return true;
      default:
        return super.applySceneProp(key, value);
    }
  }

  private currentAsset(): RenderableImageAsset | undefined {
    if (this.selected && this.enabled) return this.activeAsset ?? this.normalAsset;
    return this.normalAsset ?? this.activeAsset;
  }

  private applyButtonState(): void {
    const background = this.background;
    if (!background) return;

    const asset = this.currentAsset();
    const isFlashing = performance.now() < this.flashUntil;
    if (background instanceof Phaser.GameObjects.Image && asset) {
      background.setTexture(asset.textureKey, isFrameAsset(asset) ? asset.frameKey : undefined);
      background.setTint(isFlashing ? DEFAULT_FLASH_TINT : 0xffffff);
    } else if (background instanceof Phaser.GameObjects.Rectangle) {
      background.setFillStyle(isFlashing ? DEFAULT_FLASH_TINT : this.selected && this.enabled ? DEFAULT_ACTIVE_COLOR : DEFAULT_NORMAL_COLOR);
      background.setSize(this.size.width || DEFAULT_BUTTON_WIDTH, this.size.height || DEFAULT_BUTTON_HEIGHT);
    }
    background.setAlpha(this.enabled ? 1 : DEFAULT_DISABLED_ALPHA);
    this.phaserLabel?.setText(this.label).setAlpha(this.enabled ? 1 : DEFAULT_DISABLED_ALPHA);
    if (this.sizeMode === 'content') this.size = backgroundLocalSize(this, background);
  }

  private labelFontFamily(ctx?: NodeContext): string {
    if (!this.fontId) return DEFAULT_LABEL_FONT_FAMILY;
    return ctx?.assets.fontFamily(this.fontId) ?? this.assets.fontFamily(this.fontId);
  }

  private applyLabelStyle(): void {
    this.phaserLabel?.setStyle({
      fontFamily: this.labelFontFamily(),
      fontSize: `${this.fontSize}px`,
    });
  }

  private applyButtonTransform(): void {
    const background = this.background;
    const label = this.phaserLabel;
    if (!background || !label) return;

    this.applyTransformTo(background);
    const transform = this.getPhaserTransform();
    const offset = rotatedOffset(0, this.labelOffsetY, { x: transform.scaleX, y: transform.scaleY }, transform.rotation);
    label
      .setOrigin(0.5)
      .setPosition(transform.x + offset.x, transform.y + offset.y)
      .setRotation(transform.rotation)
      .setScale(transform.scaleX, transform.scaleY)
      .setVisible(transform.visible)
      .setScrollFactor(transform.scrollFactor);
  }

  private configureInteractivity(): void {
    const objects = [this.background, this.phaserLabel].filter((object): object is ButtonBackground | Phaser.GameObjects.Text => Boolean(object));
    for (const object of objects) {
      object.removeAllListeners('pointerover');
      object.removeAllListeners('pointerdown');
      object.disableInteractive();
      if (!this.enabled) continue;
      object.setInteractive({ useHandCursor: true });
      object.on('pointerover', () => this.hoverCallback?.(this));
      object.on('pointerdown', () => this.activateCallback?.(this));
    }
  }
}
