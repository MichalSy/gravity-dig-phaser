import type Phaser from 'phaser';
import type { DebugImageAnimationDescriptor, DebugImageAssetDescriptor } from '@gravity-dig/debug-protocol';
import { ImageAssetKind, isFrameAsset, type FrameAsset, type ImageAnimationAsset, type RenderableImageAsset } from './imageAssets';
import { animationSetMetaKey, type AnimationSetDefinition, type AnimationSetMeta } from './animationSetMeta';
import { imageAtlasMetaKey, type ImageAtlasMeta } from './imageAtlasMeta';

export interface ImageAssetDefinition {
  key: string;
  path: string;
  meta?: boolean;
}

interface ImageAssetSource {
  path: string;
  url: string;
}

export class AssetCatalog {
  private readonly images = new Map<string, RenderableImageAsset>();
  private readonly animations = new Map<string, ImageAnimationAsset>();
  private readonly imageSources = new Map<string, ImageAssetSource>();
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  registerImages(definitions: readonly ImageAssetDefinition[]): void {
    for (const definition of definitions) this.registerImage(definition);
  }

  registerAnimationSets(definitions: readonly AnimationSetDefinition[]): void {
    for (const definition of definitions) this.registerAnimationSet(definition);
  }

  image(id: string): RenderableImageAsset {
    const asset = this.images.get(id);
    if (!asset) throw new Error(`Image asset '${id}' is not registered`);
    return asset;
  }

  animation(id: string): ImageAnimationAsset {
    const asset = this.animations.get(id);
    if (!asset) throw new Error(`Image animation asset '${id}' is not registered`);
    return asset;
  }

  hasImage(id: string): boolean {
    return this.images.has(id);
  }

  listDebugImages(): DebugImageAssetDescriptor[] {
    return [...this.images.values()].map((asset) => {
      if (isFrameAsset(asset)) {
        const source = this.imageSources.get(asset.sourceImageId);
        return {
          id: asset.id,
          kind: asset.kind,
          textureKey: asset.textureKey,
          url: source?.url,
          width: asset.width,
          height: asset.height,
          frameKey: asset.frameKey,
          sourceImageId: asset.sourceImageId,
          sourceUrl: source?.url,
          rect: asset.rect,
        } satisfies DebugImageAssetDescriptor;
      }

      return {
        id: asset.id,
        kind: asset.kind,
        textureKey: asset.textureKey,
        url: this.imageSources.get(asset.id)?.url,
        width: asset.width,
        height: asset.height,
      } satisfies DebugImageAssetDescriptor;
    });
  }

  listDebugAnimations(): DebugImageAnimationDescriptor[] {
    return [...this.animations.values()].map((animation) => ({
      id: animation.id,
      kind: animation.kind,
      frameIds: animation.frames.map((frame) => frame.asset.id),
      fps: animation.fps,
      loop: animation.loop,
    }));
  }

  private registerImage(definition: ImageAssetDefinition): void {
    if (!this.scene.textures.exists(definition.key)) return;

    const texture = this.scene.textures.get(definition.key);
    const source = texture.getSourceImage() as { width?: number; height?: number } | undefined;
    const width = source?.width ?? 0;
    const height = source?.height ?? 0;

    this.images.set(definition.key, {
      kind: ImageAssetKind.Image,
      id: definition.key,
      textureKey: definition.key,
      width,
      height,
    });
    this.imageSources.set(definition.key, { path: definition.path, url: new URL(definition.path, window.location.origin).toString() });

    if (!definition.meta) return;

    const meta = this.scene.cache.json.get(imageAtlasMetaKey(definition.key)) as ImageAtlasMeta | undefined;
    if (!meta) return;

    for (const [frameKey, rect] of Object.entries(meta.frames ?? {})) {
      texture.add(frameKey, 0, rect.x, rect.y, rect.width, rect.height);
      const id = `${definition.key}#${frameKey}`;
      this.images.set(id, {
        kind: ImageAssetKind.Frame,
        id,
        textureKey: definition.key,
        frameKey,
        sourceImageId: definition.key,
        rect,
        width: rect.width,
        height: rect.height,
      } satisfies FrameAsset);
    }

    for (const [animationKey, animation] of Object.entries(meta.animations ?? {})) {
      const id = `${definition.key}@${animationKey}`;
      this.animations.set(id, {
        kind: ImageAssetKind.Animation,
        id,
        setId: definition.key,
        animationId: animationKey,
        frames: animation.frames.map((frameKey) => ({ asset: this.image(`${definition.key}#${frameKey}`) })),
        fps: animation.fps,
        loop: animation.loop ?? true,
      });
    }
  }

  private registerAnimationSet(definition: AnimationSetDefinition): void {
    const meta = this.scene.cache.json.get(animationSetMetaKey(definition.key)) as AnimationSetMeta | undefined;
    if (!meta) return;
    if (meta.schema !== 'animation-set' || meta.version !== 1) {
      throw new Error(`Animation set '${definition.key}' uses unsupported schema/version`);
    }

    for (const [animationKey, animation] of Object.entries(meta.animations)) {
      const id = `${meta.id}.${animationKey}`;
      this.animations.set(id, {
        kind: ImageAssetKind.Animation,
        id,
        setId: meta.id,
        animationId: animationKey,
        frames: animation.frames.map((frame) => ({ asset: this.image(frame.asset), durationMs: frame.durationMs })),
        fps: animation.fps ?? 1,
        loop: animation.loop ?? true,
      });
    }
  }
}
