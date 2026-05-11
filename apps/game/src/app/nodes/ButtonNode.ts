import Phaser from 'phaser';
import type { DebugNodePatch, DebugOverlayLayerDescriptor } from '@gravity-dig/debug-protocol';
import { isFrameAsset, type RenderableImageAsset } from '../../nodes';
import { type DebugOverlayLayerRenderContext, type NodeContext, type NodeDebugBounds, type NodeDebugProps } from '../../nodes';
import { NODE_TYPE_IDS } from '../../nodes';
import { exposedPropGroup, propAssetId, propBoolean, propString, type ExposedPropGroup } from '../../nodes';
import { TransformNode, type TransformNodeOptions } from '../../nodes';

export interface ButtonNodeOptions extends TransformNodeOptions {
  action?: string;
  label?: string;
  enabled?: boolean;
  normalAssetId?: string;
  activeAssetId?: string;
  selected?: boolean;
}

type ButtonCallback = (button: ButtonNode) => void;

function imageLocalSize(image: Phaser.GameObjects.Image): { width: number; height: number } {
  return { width: image.frame.width, height: image.frame.height };
}

function imageLocalBounds(node: ButtonNode, image: Phaser.GameObjects.Image): NodeDebugBounds {
  const size = imageLocalSize(image);
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
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.ButtonNode;
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
    }),
  ];

  action: string;
  label: string;
  enabled: boolean;
  selected: boolean;
  normalAssetId: string;
  activeAssetId: string;

  private normalAsset!: RenderableImageAsset;
  private activeAsset!: RenderableImageAsset;
  private phaserImage?: Phaser.GameObjects.Image;
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
    this.normalAssetId = options.normalAssetId ?? 'menu-button-inactive';
    this.activeAssetId = options.activeAssetId ?? 'menu-button-active';
  }

  init(ctx: NodeContext): void {
    this.normalAsset = ctx.assets.image(this.normalAssetId);
    this.activeAsset = ctx.assets.image(this.activeAssetId);
    const asset = this.currentAsset();
    this.phaserImage = ctx.phaserScene.add.image(0, 0, asset.textureKey, isFrameAsset(asset) ? asset.frameKey : undefined);
    this.phaserLabel = ctx.phaserScene.add.text(0, 0, this.label, {
      fontFamily: 'Silkscreen',
      fontSize: '27px',
      fontStyle: '700',
      color: '#fff4c7',
      stroke: '#4d260f',
      strokeThickness: 5,
      align: 'center',
    }).setOrigin(0.5).setResolution(2);
    this.configureInteractivity();
    if (this.sizeMode === 'content') this.size = imageLocalSize(this.phaserImage);
    this.applyButtonState();
    this.applyButtonTransform();
  }

  override measureSelf(): void {
    if (this.phaserImage && this.sizeMode === 'content') this.size = imageLocalSize(this.phaserImage);
  }

  override coreUpdate(): void {
    this.applyButtonState();
    this.applyButtonTransform();
  }

  destroy(): void {
    this.phaserImage?.destroy();
    this.phaserLabel?.destroy();
    this.phaserImage = undefined;
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
    this.phaserImage?.setVisible(active && this.visible);
    this.phaserLabel?.setVisible(active && this.visible);
  }

  protected override getLocalContentBounds(): NodeDebugBounds | undefined {
    if (!this.phaserImage) return super.getLocalContentBounds();
    return imageLocalBounds(this, this.phaserImage);
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
    if (this.phaserImage) objects.push(this.phaserImage);
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
        this.normalAsset = this.assets.image(value);
        return true;
      case 'activeAssetId':
        if (typeof value !== 'string') return false;
        this.activeAssetId = value;
        this.activeAsset = this.assets.image(value);
        return true;
      default:
        return super.applySceneProp(key, value);
    }
  }

  private currentAsset(): RenderableImageAsset {
    return this.selected && this.enabled ? this.activeAsset : this.normalAsset;
  }

  private applyButtonState(): void {
    const image = this.phaserImage;
    if (!image) return;
    const asset = this.currentAsset();
    image.setTexture(asset.textureKey, isFrameAsset(asset) ? asset.frameKey : undefined);
    image.setAlpha(this.enabled ? 1 : 0.45);
    image.setTint(performance.now() < this.flashUntil ? 0xfff1a8 : 0xffffff);
    this.phaserLabel?.setText(this.label).setAlpha(this.enabled ? 1 : 0.45);
    if (this.sizeMode === 'content') this.size = imageLocalSize(image);
  }

  private applyButtonTransform(): void {
    const image = this.phaserImage;
    const label = this.phaserLabel;
    if (!image || !label) return;

    this.applyTransformTo(image);
    const transform = this.getPhaserTransform();
    const offset = rotatedOffset(0, -4, { x: transform.scaleX, y: transform.scaleY }, transform.rotation);
    label
      .setOrigin(0.5)
      .setPosition(transform.x + offset.x, transform.y + offset.y)
      .setRotation(transform.rotation)
      .setScale(transform.scaleX, transform.scaleY)
      .setVisible(transform.visible)
      .setScrollFactor(transform.scrollFactor);
  }

  private configureInteractivity(): void {
    const objects = [this.phaserImage, this.phaserLabel].filter((object): object is Phaser.GameObjects.Image | Phaser.GameObjects.Text => Boolean(object));
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
