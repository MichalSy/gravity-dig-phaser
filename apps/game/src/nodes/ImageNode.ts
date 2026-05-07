import Phaser from 'phaser';
import { isFrameAsset, type RenderableImageAsset } from '../assets/imageAssets';
import type { DebugNodePatch, DebugOverlayLayerDescriptor } from '@gravity-dig/debug-protocol';
import { type DebugOverlayLayerRenderContext, type NodeContext, type NodeDebugBounds, type NodeDebugProps } from './GameNode';
import { NODE_TYPE_IDS } from './NodeTypeIds';
import { exposedPropGroup, propAssetId, propBoolean, type ExposedPropGroup } from './SceneProps';
import { TransformNode, type TransformNodeOptions } from './TransformNode';

export type ImageNodeSyncMode = 'node-to-object' | 'object-to-node';

type CroppableImage = Phaser.GameObjects.Image & {
  isCropped?: boolean;
  _crop?: { x: number; y: number; width: number; height: number };
};

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


function visibleImageBoundsInParentSpace(node: ImageNode, image: Phaser.GameObjects.Image): NodeDebugBounds {
  const cropImage = image as CroppableImage;
  const crop = cropImage.isCropped ? cropImage._crop : undefined;
  const frameWidth = image.frame.width;
  const frameHeight = image.frame.height;
  const cropX = crop?.x ?? 0;
  const cropY = crop?.y ?? 0;
  const cropWidth = crop?.width ?? frameWidth;
  const cropHeight = crop?.height ?? frameHeight;
  const originPosition = node.getPositionInParent();
  const originOffset = node.getLocalOriginOffset();
  const left = originPosition.x - originOffset.x * node.scaleX + cropX * node.scaleX;
  const top = originPosition.y - originOffset.y * node.scaleY + cropY * node.scaleY;
  return { x: left, y: top, width: cropWidth * Math.abs(node.scaleX), height: cropHeight * Math.abs(node.scaleY), scrollFactor: node.scrollFactor };
}

function visibleImageWorldBounds(image: Phaser.GameObjects.Image): NodeDebugBounds {
  const cropImage = image as CroppableImage;
  const crop = cropImage.isCropped ? cropImage._crop : undefined;
  const frameWidth = image.frame.width;
  const frameHeight = image.frame.height;
  const cropX = crop?.x ?? 0;
  const cropY = crop?.y ?? 0;
  const cropWidth = crop?.width ?? frameWidth;
  const cropHeight = crop?.height ?? frameHeight;
  const scaleX = image.scaleX;
  const scaleY = image.scaleY;
  const left = image.x - image.originX * frameWidth * scaleX + cropX * scaleX;
  const top = image.y - image.originY * frameHeight * scaleY + cropY * scaleY;
  return { x: left, y: top, width: cropWidth * Math.abs(scaleX), height: cropHeight * Math.abs(scaleY) };
}

export interface ImageNodeOptions extends TransformNodeOptions {
  assetId: string;
  flipX?: boolean;
  syncMode?: ImageNodeSyncMode;
}

export class ImageNode extends TransformNode {
  static override readonly nodeTypeId: string = NODE_TYPE_IDS.ImageNode;
  static override readonly sceneType: string = 'ImageNode';
  static override readonly debugOverlayLayers: readonly DebugOverlayLayerDescriptor[] = [
    { id: 'image.visibleBounds', label: 'Image Visible Bounds', source: 'ImageNode' },
  ];
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    ...TransformNode.exposedPropGroups,
    exposedPropGroup('Image', {
      assetId: propAssetId({ label: 'Asset' }),
      flipX: propBoolean({ label: 'Flip X' }),
    }),
  ];

  assetId: string;
  flipX: boolean;
  protected asset!: RenderableImageAsset;
  protected phaserImage?: Phaser.GameObjects.Image;
  private readonly syncMode: ImageNodeSyncMode;

  constructor(options: ImageNodeOptions) {
    super({ ...options, className: options.className ?? 'ImageNode', sizeMode: options.sizeMode ?? 'explicit' });
    this.assetId = options.assetId;
    this.flipX = options.flipX ?? false;
    this.syncMode = options.syncMode ?? 'node-to-object';
  }

  get image(): Phaser.GameObjects.Image {
    if (!this.phaserImage) throw new Error(`ImageNode '${this.debugName()}' has no Phaser image`);
    return this.phaserImage;
  }

  init(ctx: NodeContext): void {
    this.asset = ctx.assets.image(this.assetId);
    const frame = isFrameAsset(this.asset) ? this.asset.frameKey : undefined;
    this.size = { width: this.asset.width, height: this.asset.height };
    this.phaserImage = ctx.phaserScene.add.image(0, 0, this.asset.textureKey, frame).setFlipX(this.flipX);
    this.size = visibleImageLocalSize(this.phaserImage);
    this.applyTransformTo(this.phaserImage);
  }

  update(_deltaMs?: number): void {
    if (!this.phaserImage) return;

    if (this.syncMode === 'object-to-node') {
      this.position = this.worldToLocalPosition({ x: this.phaserImage.x, y: this.phaserImage.y });
      const visibleSize = visibleImageLocalSize(this.phaserImage);
      const parentScale = this.getParentWorldScale();
      this.size = visibleSize;
      this.visible = this.phaserImage.visible;
      this.scale = parentScale.x === 0 ? this.phaserImage.scaleX : this.phaserImage.scaleX / parentScale.x;
      this.scaleX = this.scale;
      this.scaleY = parentScale.y === 0 ? this.phaserImage.scaleY : this.phaserImage.scaleY / parentScale.y;
      this.rotation = this.phaserImage.rotation - (this.parent?.getWorldRotation() ?? 0);
      this.flipX = this.phaserImage.flipX;
      return;
    }

    this.applyTransformTo(this.phaserImage).setFlipX(this.flipX);
  }

  destroy(): void {
    this.phaserImage?.destroy();
    this.phaserImage = undefined;
  }

  protected override onEffectiveActiveChanged(active: boolean): void {
    this.phaserImage?.setVisible(active && this.visible);
  }

  setAsset(asset: RenderableImageAsset): void {
    this.asset = asset;
    const frame = isFrameAsset(asset) ? asset.frameKey : undefined;
    this.phaserImage?.setTexture(asset.textureKey, frame);
    if (this.phaserImage) {
      this.size = visibleImageLocalSize(this.phaserImage);
      this.applyTransformTo(this.phaserImage);
    } else {
      this.size = { width: asset.width, height: asset.height };
    }
  }

  override getBoundsInParentSpace(): NodeDebugBounds | undefined {
    if (!this.phaserImage) return super.getBoundsInParentSpace();
    return visibleImageBoundsInParentSpace(this, this.phaserImage);
  }

  override getWorldBounds(): NodeDebugBounds | undefined {
    return this.getDebugBounds();
  }

  override getDebugBounds(): NodeDebugBounds | undefined {
    if (!this.phaserImage) return super.getDebugBounds();
    const bounds = visibleImageWorldBounds(this.phaserImage);
    return { ...bounds, scrollFactor: this.scrollFactor };
  }

  protected override renderDebugOverlayLayer(ctx: DebugOverlayLayerRenderContext): boolean {
    if (ctx.layer.id !== 'image.visibleBounds') return super.renderDebugOverlayLayer(ctx);
    const bounds = this.getDebugBounds();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false;
    ctx.graphics
      .setVisible(true)
      .setScrollFactor(bounds.scrollFactor ?? this.scrollFactor)
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
      scrollFactor: this.scrollFactor,
    };
  }

  protected override applySceneProp(key: string, value: DebugNodePatch[string]): boolean {
    switch (key) {
      case 'assetId':
        if (typeof value !== 'string') return false;
        this.assetId = value;
        if (this.isInitialized) this.setAsset(this.assets.image(value));
        return true;
      case 'flipX':
        if (typeof value !== 'boolean') return false;
        this.flipX = value;
        this.phaserImage?.setFlipX(value);
        return true;
      default:
        return super.applySceneProp(key, value);
    }
  }

}
