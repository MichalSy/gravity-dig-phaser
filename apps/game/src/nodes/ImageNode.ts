import Phaser from 'phaser';
import { isFrameAsset, type RenderableImageAsset } from '../assets/imageAssets';
import { type NodeContext, type NodeDebugBounds, type NodeDebugProps } from './GameNode';
import { TransformNode, type TransformNodeOptions } from './TransformNode';

export type ImageNodeSyncMode = 'node-to-object' | 'object-to-node';

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
    this.size = { width: this.asset.width * this.scale, height: this.asset.height * this.scale };
    this.applyOrigin();
  }

  update(_deltaMs?: number): void {
    if (!this.phaserImage) return;

    if (this.syncMode === 'object-to-node') {
      this.position = this.worldToLocalPosition({ x: this.phaserImage.x, y: this.phaserImage.y });
      this.size = { width: this.phaserImage.displayWidth, height: this.phaserImage.displayHeight };
      this.visible = this.phaserImage.visible;
      this.depth = this.phaserImage.depth;
      const parentScale = this.getParentWorldScale();
      this.scale = parentScale.x === 0 ? this.phaserImage.scaleX : this.phaserImage.scaleX / parentScale.x;
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
    this.size = { width: asset.width * this.scale, height: asset.height * this.scale };
    this.applyOrigin();
  }

  override getDebugBounds(): NodeDebugBounds | undefined {
    if (!this.phaserImage) return super.getDebugBounds();
    const bounds = this.phaserImage.getBounds();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, scrollFactor: this.scrollFactor };
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
      flipX: this.flipX,
      scrollFactor: this.scrollFactor,
    };
  }

  private applyOrigin(): void {
    if (!this.phaserImage) return;
    this.phaserImage.setOrigin(this.origin.x, this.origin.y);
  }
}
