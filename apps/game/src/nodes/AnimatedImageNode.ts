import type { DebugNodePatch } from '@gravity-dig/debug-protocol';
import type { ImageAnimationAsset } from '../assets/imageAssets';
import { type NodeContext, type NodeDebugProps } from './GameNode';
import { ImageNode, type ImageNodeOptions } from './ImageNode';
import { exposedPropGroup, propBoolean, propNumber, propString, type ExposedPropGroup } from './SceneProps';

export interface AnimatedImageNodeOptions extends Omit<ImageNodeOptions, 'assetId'> {
  animationSetId: string;
  animationId: string;
  playing?: boolean;
  fpsOverride?: number;
  loopOverride?: boolean;
}

export class AnimatedImageNode extends ImageNode {
  static override readonly sceneType: string = 'AnimatedImageNode';
  static override readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    ...ImageNode.exposedPropGroups.map((group) => group.name === 'Image'
      ? exposedPropGroup('Image', Object.fromEntries(Object.entries(group.props).map(([key, prop]) => [key, { ...prop, readOnly: true, reason: 'computed by animation' }])))
      : group),
    exposedPropGroup('Animation', {
      animationSetId: propString({ label: 'Animation Set' }),
      animationId: propString({ label: 'Animation' }),
      playing: propBoolean({ label: 'Playing' }),
      fpsOverride: propNumber({ label: 'FPS Override', min: 0, step: 1 }),
      loopOverride: propBoolean({ label: 'Loop Override' }),
    }),
  ];

  animationSetId: string;
  animationId: string;
  playing: boolean;
  fpsOverride?: number;
  loopOverride?: boolean;
  private animation!: ImageAnimationAsset;
  private frameIndex = 0;
  private frameElapsedMs = 0;

  constructor(options: AnimatedImageNodeOptions) {
    super({ ...options, assetId: '', className: options.className ?? 'AnimatedImageNode' });
    this.animationSetId = options.animationSetId;
    this.animationId = options.animationId;
    this.playing = options.playing ?? true;
    this.fpsOverride = options.fpsOverride;
    this.loopOverride = options.loopOverride;
  }

  override init(ctx: NodeContext): void {
    this.animation = ctx.assets.animation(this.qualifiedAnimationId());
    const firstFrame = this.animation.frames[0]?.asset;
    if (!firstFrame) throw new Error(`Image animation '${this.qualifiedAnimationId()}' has no frames`);
    this.assetId = firstFrame.id;
    super.init(ctx);
  }

  play(animationId = this.animationId, options: { restart?: boolean } = {}): void {
    if (this.animationId === animationId && !options.restart) {
      this.playing = true;
      return;
    }

    this.animationId = animationId;
    this.animation = this.assets.animation(this.qualifiedAnimationId());
    this.frameIndex = 0;
    this.frameElapsedMs = 0;
    this.playing = true;
    this.applyCurrentFrame();
  }

  stop(): void {
    this.playing = false;
  }

  override update(deltaMs: number): void {
    this.updateAnimation(deltaMs);
    super.update(deltaMs);
  }

  override getDebugProps(): NodeDebugProps {
    return {
      ...super.getDebugProps(),
      animationSetId: this.animationSetId,
      animationId: this.animationId,
      qualifiedAnimationId: this.qualifiedAnimationId(),
      playing: this.playing,
      frameIndex: this.frameIndex,
      frameAssetId: this.currentFrameAsset()?.id ?? null,
      fps: this.effectiveFps(),
      loop: this.effectiveLoop(),
    };
  }

  protected override applySceneProp(key: string, value: DebugNodePatch[string]): boolean {
    switch (key) {
      case 'animationSetId':
        if (typeof value !== 'string') return false;
        this.animationSetId = value;
        this.reloadAnimation(true);
        return true;
      case 'animationId':
        if (typeof value !== 'string') return false;
        this.animationId = value;
        this.reloadAnimation(true);
        return true;
      case 'playing':
        if (typeof value !== 'boolean') return false;
        this.playing = value;
        return true;
      case 'fpsOverride':
        if (typeof value !== 'number') return false;
        this.fpsOverride = value > 0 ? value : undefined;
        return true;
      case 'loopOverride':
        if (typeof value !== 'boolean') return false;
        this.loopOverride = value;
        return true;
      default:
        return super.applySceneProp(key, value);
    }
  }

  private reloadAnimation(restart: boolean): void {
    if (!this.isInitialized) return;
    this.animation = this.assets.animation(this.qualifiedAnimationId());
    if (restart) {
      this.frameIndex = 0;
      this.frameElapsedMs = 0;
    } else {
      this.frameIndex = Math.min(this.frameIndex, Math.max(0, this.animation.frames.length - 1));
    }
    this.applyCurrentFrame();
  }

  private updateAnimation(deltaMs: number): void {
    if (!this.playing || !this.animation || this.animation.frames.length <= 1) return;

    this.frameElapsedMs += deltaMs;
    let frameDurationMs = this.currentFrameDurationMs();
    while (frameDurationMs > 0 && this.frameElapsedMs >= frameDurationMs) {
      this.frameElapsedMs -= frameDurationMs;
      const lastFrame = this.animation.frames.length - 1;
      if (this.frameIndex >= lastFrame) {
        if (!this.effectiveLoop()) {
          this.frameIndex = lastFrame;
          this.playing = false;
          break;
        }
        this.frameIndex = 0;
      } else {
        this.frameIndex += 1;
      }
      this.applyCurrentFrame();
      frameDurationMs = this.currentFrameDurationMs();
    }
  }

  private applyCurrentFrame(): void {
    const frame = this.currentFrameAsset();
    if (!frame || frame.id === this.assetId) return;
    this.assetId = frame.id;
    this.setAsset(frame);
  }

  private currentFrameAsset() {
    return this.animation?.frames[this.frameIndex]?.asset;
  }

  private currentFrameDurationMs(): number {
    return this.animation.frames[this.frameIndex]?.durationMs ?? 1000 / this.effectiveFps();
  }

  private effectiveFps(): number {
    return this.fpsOverride ?? this.animation?.fps ?? 1;
  }

  private effectiveLoop(): boolean {
    return this.loopOverride ?? this.animation?.loop ?? true;
  }

  private qualifiedAnimationId(): string {
    return `${this.animationSetId}.${this.animationId}`;
  }
}
