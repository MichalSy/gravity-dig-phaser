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
    this.phaserImage = ctx.phaserScene.add
      .image(this.position.x, this.position.y, this.asset.textureKey, frame)
      .setDepth(this.depth)
      .setScale(this.scale)
      .setFlipX(this.flipX)
      .setVisible(this.visible)
      .setScrollFactor(this.scrollFactor);
    this.size = { width: this.asset.width * this.scale, height: this.asset.height * this.scale };
    this.applyOrigin();
  }

  update(_deltaMs?: number): void {
    if (!this.phaserImage) return;

    if (this.syncMode === 'object-to-node') {
      this.position = { x: this.phaserImage.x, y: this.phaserImage.y };
      this.size = { width: this.phaserImage.displayWidth, height: this.phaserImage.displayHeight };
      this.visible = this.phaserImage.visible;
      this.depth = this.phaserImage.depth;
      this.scale = this.phaserImage.scaleX;
      this.flipX = this.phaserImage.flipX;
      return;
    }

    this.phaserImage
      .setPosition(this.position.x, this.position.y)
      .setDepth(this.depth)
      .setScale(this.scale)
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
      flipX: this.flipX,
      scrollFactor: this.scrollFactor,
    };
  }

  private applyOrigin(): void {
    if (!this.phaserImage) return;
    const originX = this.anchor.endsWith('center') || this.anchor === 'center' ? 0.5 : this.anchor.endsWith('right') ? 1 : 0;
    const originY = this.anchor.startsWith('center') || this.anchor === 'center' ? 0.5 : this.anchor.startsWith('bottom') ? 1 : 0;
    this.phaserImage.setOrigin(originX, originY);
  }
}
