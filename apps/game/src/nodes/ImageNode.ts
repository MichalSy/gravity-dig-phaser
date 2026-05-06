import Phaser from 'phaser';
import { isFrameAsset, type RenderableImageAsset } from '../assets/imageAssets';
import { type NodeContext, type NodeDebugBounds, type NodeDebugProps } from './GameNode';
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
  const anchorPosition = node.getPositionInParent();
  const left = anchorPosition.x - image.originX * frameWidth * node.scaleX + cropX * node.scaleX;
  const top = anchorPosition.y - image.originY * frameHeight * node.scaleY + cropY * node.scaleY;
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
  assetId: string;
  flipX: boolean;
  protected asset!: RenderableImageAsset;
  protected phaserImage?: Phaser.GameObjects.Image;
  private readonly syncMode: ImageNodeSyncMode;

  constructor(options: ImageNodeOptions) {
    super({ ...options, className: options.className ?? 'ImageNode' });
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
    const worldPosition = this.getWorldPosition();
    const worldScale = this.getWorldScale();
    this.phaserImage = ctx.phaserScene.add
      .image(worldPosition.x, worldPosition.y, this.asset.textureKey, frame)
      .setDepth(this.depth)
      .setScale(worldScale.x, worldScale.y)
      .setFlipX(this.flipX)
      .setVisible(this.visible)
      .setScrollFactor(this.scrollFactor);
    this.size = visibleImageLocalSize(this.phaserImage);
    this.applyOrigin();
  }

  update(_deltaMs?: number): void {
    if (!this.phaserImage) return;

    if (this.syncMode === 'object-to-node') {
      this.position = this.worldToLocalPosition({ x: this.phaserImage.x, y: this.phaserImage.y });
      const visibleSize = visibleImageLocalSize(this.phaserImage);
      const parentScale = this.getParentWorldScale();
      this.size = visibleSize;
      this.visible = this.phaserImage.visible;
      this.depth = this.phaserImage.depth;
      this.scale = parentScale.x === 0 ? this.phaserImage.scaleX : this.phaserImage.scaleX / parentScale.x;
      this.scaleX = this.scale;
      this.scaleY = parentScale.y === 0 ? this.phaserImage.scaleY : this.phaserImage.scaleY / parentScale.y;
      this.rotation = this.phaserImage.rotation - (this.parent?.getWorldRotation() ?? 0);
      this.flipX = this.phaserImage.flipX;
      return;
    }

    const worldPosition = this.getWorldPosition();
    const worldScale = this.getWorldScale();
    this.phaserImage
      .setPosition(worldPosition.x, worldPosition.y)
      .setDepth(this.depth)
      .setRotation(this.getWorldRotation())
      .setScale(worldScale.x, worldScale.y)
      .setFlipX(this.flipX)
      .setVisible(this.visible)
      .setScrollFactor(this.scrollFactor);
    this.applyOrigin();
  }

  destroy(): void {
    this.phaserImage?.destroy();
    this.phaserImage = undefined;
  }

  setAsset(asset: RenderableImageAsset): void {
    this.asset = asset;
    const frame = isFrameAsset(asset) ? asset.frameKey : undefined;
    this.phaserImage?.setTexture(asset.textureKey, frame);
    if (this.phaserImage) this.size = visibleImageLocalSize(this.phaserImage);
    else this.size = { width: asset.width, height: asset.height };
    this.applyOrigin();
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

  override getDebugProps(): NodeDebugProps {
    return {
      ...super.getDebugProps(),
      assetId: this.asset.id,
      assetKind: this.asset.kind,
      textureKey: this.asset.textureKey,
      frameKey: isFrameAsset(this.asset) ? this.asset.frameKey : null,
      depth: this.depth,
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

  private applyOrigin(): void {
    if (!this.phaserImage) return;
    this.phaserImage.setOrigin(this.origin.x, this.origin.y);
  }
}
