import type { ImageAnimationAsset } from '../assets/imageAssets';
import { type NodeContext, type NodeDebugProps } from './GameNode';
import { ImageNode, type ImageNodeOptions } from './ImageNode';

export interface AnimatedImageNodeOptions extends Omit<ImageNodeOptions, 'assetId'> {
  animationId: string;
}

export class AnimatedImageNode extends ImageNode {
  readonly animationId: string;
  private animation!: ImageAnimationAsset;
  private frameIndex = 0;
  private frameElapsedMs = 0;

  constructor(options: AnimatedImageNodeOptions) {
    super({ ...options, assetId: '', className: options.className ?? 'AnimatedImageNode' });
    this.animationId = options.animationId;
  }

  override init(ctx: NodeContext): void {
    this.animation = ctx.assets.animation(this.animationId);
    const firstFrame = this.animation.frames[0];
    if (!firstFrame) throw new Error(`Image animation '${this.animationId}' has no frames`);
    this.assetId = firstFrame.id;
    super.init(ctx);
  }

  override update(deltaMs: number): void {
    super.update(deltaMs);
    if (this.animation.frames.length <= 1 || this.animation.fps <= 0) return;

    this.frameElapsedMs += deltaMs;
    const frameDurationMs = 1000 / this.animation.fps;
    while (this.frameElapsedMs >= frameDurationMs) {
      this.frameElapsedMs -= frameDurationMs;
      this.frameIndex += 1;
      if (this.frameIndex >= this.animation.frames.length) this.frameIndex = this.animation.loop ? 0 : this.animation.frames.length - 1;
      this.setAsset(this.animation.frames[this.frameIndex]);
    }
  }

  override getDebugProps(): NodeDebugProps {
    return {
      ...super.getDebugProps(),
      animationId: this.animationId,
      frameIndex: this.frameIndex,
      fps: this.animation.fps,
      loop: this.animation.loop,
    };
  }
}
