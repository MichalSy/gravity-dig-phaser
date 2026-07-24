import Phaser from 'phaser';
import { isFrameAsset, type RenderableImageAsset } from '../assets/imageAssets';
import type { DebugNodePatch, DebugOverlayLayerDescriptor } from '@gravity-dig/debug-protocol';
import { type DebugOverlayLayerRenderContext, type NodeContext, type NodeDebugBounds, type NodeDebugProps } from './GameNode';
import { CORE_NODE_TYPE_IDS } from './NodeTypeIds';
import { exposedPropGroup, propAssetId, propBoolean, propColor, propNumber, type ExposedPropGroup } from './SceneProps';
import { TransformNode, type TransformNodeOptions } from './TransformNode';

export type ImageNodeSyncMode = 'node-to-object' | 'object-to-node';

type CroppableImage = Phaser.GameObjects.Image & {
  isCropped?: boolean;
  _crop?: { x: number; y: number; width: number; height: number };
};

function imageFrameLocalSize(image: Phaser.GameObjects.Image): { width: number; height: number } {
  return { width: image.frame.width, height: image.frame.height };
}

function visibleImageLocalSize(image: Phaser.GameObjects.Image): { width: number; height: number } {
  const cropImage = image as CroppableImage;
  const crop = cropImage.isCropped ? cropImage._crop : undefined;
  const frameWidth = crop?.width ?? image.frame.width;
  const frameHeight = crop?.height ?? image.frame.height;
  return { width: frameWidth, height: frameHeight };
}

function visibleImageDisplaySize(image: Phaser.GameObjects.Image): { width: number; height: number } {
  const size = visibleImageLocalSize(image);
  return { width: size.width * Math.abs(image.scaleX), height: size.height * Math.abs(image.scaleY) };
}

export interface ImageNodeOptions extends TransformNodeOptions {
  assetId: string;
  flipX?: boolean;
  alpha?: number;
  tint?: string;
  syncMode?: ImageNodeSyncMode;
}

export class ImageNode extends TransformNode {
  static override readonly nodeTypeId: string = CORE_NODE_TYPE_IDS.ImageNode;
  static override readonly sceneType: string = 'ImageNode';
  static override readonly debugOverlayLayers: readonly DebugOverlayLayerDescriptor[] = [
    { id: 'image.visibleBounds', label: 'Image Visible Bounds', source: 'ImageNode' },
  ];
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    ...TransformNode.exposedPropGroups,
    exposedPropGroup('Image', {
      assetId: propAssetId({ label: 'Asset' }),
      flipX: propBoolean({ label: 'Flip X' }),
      alpha: propNumber({ label: 'Alpha', min: 0, max: 1, step: 0.05 }),
      tint: propColor({ label: 'Tint' }),
    }),
  ];

  assetId: string;
  flipX: boolean;
  alpha: number;
  tint: string;
  protected asset!: RenderableImageAsset;
  protected phaserImage?: Phaser.GameObjects.Image;
  private readonly syncMode: ImageNodeSyncMode;

  constructor(options: ImageNodeOptions) {
    super({ ...options, className: options.className ?? 'ImageNode' });
    this.assetId = options.assetId;
    this.flipX = options.flipX ?? false;
    this.alpha = options.alpha ?? 1;
    this.tint = options.tint ?? '#ffffff';
    this.syncMode = options.syncMode ?? 'node-to-object';
  }

  get image(): Phaser.GameObjects.Image {
    if (!this.phaserImage) throw new Error(`ImageNode '${this.debugName()}' has no Phaser image`);
    return this.phaserImage;
  }

  init(ctx: NodeContext): void {
    this.asset = ctx.assets.image(this.assetId);
    const frame = isFrameAsset(this.asset) ? this.asset.frameKey : undefined;
    this.phaserImage = ctx.phaserScene.add.image(0, 0, this.asset.textureKey, frame).setFlipX(this.flipX);
    if (this.sizeMode === 'content') this.size = imageFrameLocalSize(this.phaserImage);
    this.applyTransformTo(this.phaserImage);
    this.applyPresentation();
  }

  override measureSelf(): void {
    if (this.phaserImage && this.sizeMode === 'content') this.size = imageFrameLocalSize(this.phaserImage);
  }

  override coreUpdate(_deltaMs?: number): void {
    if (!this.phaserImage) return;

    if (this.syncMode === 'object-to-node') {
      this.position = this.worldToLocalPosition({ x: this.phaserImage.x, y: this.phaserImage.y });
      const frameSize = imageFrameLocalSize(this.phaserImage);
      const parentScale = this.getParentWorldScale();
      this.size = frameSize;
      this.visible = this.phaserImage.visible;
      this.scale = parentScale.x === 0 ? this.phaserImage.scaleX : this.phaserImage.scaleX / parentScale.x;
      this.scaleX = this.scale;
      this.scaleY = parentScale.y === 0 ? this.phaserImage.scaleY : this.phaserImage.scaleY / parentScale.y;
      this.rotation = this.phaserImage.rotation - (this.parent?.getWorldRotation() ?? 0);
      this.flipX = this.phaserImage.flipX;
      this.alpha = this.phaserImage.alpha;
      this.tint = this.phaserImage.isTinted ? colorToHex(this.phaserImage.tintTopLeft) : '#ffffff';
      return;
    }

    this.applyTransformTo(this.phaserImage).setFlipX(this.flipX);
    this.applyPresentation();
  }

  destroy(): void {
    this.phaserImage?.destroy();
    this.phaserImage = undefined;
  }

  protected override onEffectiveActiveChanged(active: boolean): void {
    this.phaserImage?.setVisible(active && this.visible);
  }

  setAssetId(assetId: string): void {
    this.assetId = assetId;
    if (this.isInitialized) this.setAsset(this.assets.image(assetId));
  }

  setAsset(asset: RenderableImageAsset): void {
    this.asset = asset;
    const frame = isFrameAsset(asset) ? asset.frameKey : undefined;
    this.phaserImage?.setTexture(asset.textureKey, frame);
    if (this.phaserImage) {
      if (this.sizeMode === 'content') this.size = imageFrameLocalSize(this.phaserImage);
      this.applyTransformTo(this.phaserImage);
      this.applyPresentation();
    } else if (this.sizeMode === 'content') {
      this.size = { width: asset.width, height: asset.height };
    }
  }

  protected override getLocalContentBounds(): NodeDebugBounds | undefined {
    if (!this.phaserImage) return super.getLocalContentBounds();
    const frameSize = imageFrameLocalSize(this.phaserImage);
    return {
      x: -this.origin.x * frameSize.width,
      y: -this.origin.y * frameSize.height,
      width: frameSize.width,
      height: frameSize.height,
      scrollFactor: this.getEffectiveScrollFactor(),
    };
  }

  setHorizontalFill(percent: number): void {
    if (!this.phaserImage) return;
    const normalized = Math.max(0, Math.min(1, percent));
    const frameSize = imageFrameLocalSize(this.phaserImage);
    const cropWidth = Math.round(frameSize.width * normalized);
    this.phaserImage.setCrop(0, 0, cropWidth, frameSize.height);
    this.phaserImage.setVisible(this.isEffectivelyActive() && this.visible && cropWidth > 0);
  }

  protected override renderDebugOverlayLayer(ctx: DebugOverlayLayerRenderContext): boolean {
    if (ctx.layer.id !== 'image.visibleBounds') return super.renderDebugOverlayLayer(ctx);
    const bounds = this.getDebugBounds();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false;
    ctx.graphics
      .setVisible(true)
      .setScrollFactor(bounds.scrollFactor ?? this.getEffectiveScrollFactor())
      .lineStyle(2, 0x22c55e, 0.95)
      .strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
      .lineStyle(1, 0xbbf7d0, 0.9)
      .strokeRect(bounds.x + 2, bounds.y + 2, Math.max(0, bounds.width - 4), Math.max(0, bounds.height - 4));
    return true;
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    return this.phaserImage ? [this.phaserImage, ...super.getSceneObjectsInHierarchy()] : super.getSceneObjectsInHierarchy();
  }

  override getDebugProps(): NodeDebugProps {
    return {
      ...super.getDebugProps(),
      assetId: this.asset.id,
      assetKind: this.asset.kind,
      textureKey: this.asset.textureKey,
      frameKey: isFrameAsset(this.asset) ? this.asset.frameKey : null,
      scale: this.scale,
      localScaleX: this.getLocalScale().x,
      localScaleY: this.getLocalScale().y,
      displayWidth: this.phaserImage ? visibleImageDisplaySize(this.phaserImage).width : null,
      displayHeight: this.phaserImage ? visibleImageDisplaySize(this.phaserImage).height : null,
      cropWidth: this.phaserImage && (this.phaserImage as CroppableImage).isCropped ? (this.phaserImage as CroppableImage)._crop?.width ?? null : null,
      cropHeight: this.phaserImage && (this.phaserImage as CroppableImage).isCropped ? (this.phaserImage as CroppableImage)._crop?.height ?? null : null,
      flipX: this.flipX,
      alpha: this.alpha,
      tint: this.tint,
      scrollFactor: this.scrollFactor,
      effectiveScrollFactor: this.getEffectiveScrollFactor(),
    };
  }

  protected override applySceneProp(key: string, value: DebugNodePatch[string]): boolean {
    switch (key) {
      case 'assetId':
        if (typeof value !== 'string') return false;
        this.setAssetId(value);
        return true;
      case 'flipX':
        if (typeof value !== 'boolean') return false;
        this.flipX = value;
        this.phaserImage?.setFlipX(value);
        return true;
      case 'alpha':
        if (typeof value !== 'number') return false;
        this.alpha = Phaser.Math.Clamp(value, 0, 1);
        this.applyPresentation();
        return true;
      case 'tint':
        if (typeof value !== 'string') return false;
        this.tint = value;
        this.applyPresentation();
        return true;
      default:
        return super.applySceneProp(key, value);
    }
  }

  private applyPresentation(): void {
    if (!this.phaserImage) return;
    this.phaserImage.setAlpha(this.alpha);
    if (this.tint.toLowerCase() === '#ffffff') this.phaserImage.clearTint();
    else this.phaserImage.setTint(Phaser.Display.Color.HexStringToColor(this.tint).color);
  }
}

function colorToHex(value: number): string {
  return `#${(value & 0xffffff).toString(16).padStart(6, '0')}`;
}
