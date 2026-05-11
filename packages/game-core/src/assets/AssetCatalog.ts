import type Phaser from 'phaser';
import type { DebugFontAssetDescriptor, DebugImageAnimationDescriptor, DebugImageAssetDescriptor } from '@gravity-dig/debug-protocol';
import { ImageAssetKind, isFrameAsset, type FrameAsset, type ImageAnimationAsset, type RenderableImageAsset } from './imageAssets';
import { animationSetMetaKey, type AnimationSetDefinition, type AnimationSetMeta } from './animationSetMeta';
import { imageAtlasMetaKey, type ImageAtlasMeta } from './imageAtlasMeta';

export interface ImageAssetDefinition {
  key: string;
  path: string;
  meta?: boolean;
}

export interface FontAssetDefinition {
  key: string;
  family: string;
  path: string;
  label?: string;
  weight?: string;
  style?: string;
}

export interface DebugImageAssetSourceDefinition {
  id: string;
  path: string;
  url?: string;
  frameKey?: string;
  rect?: { x: number; y: number; width: number; height: number };
}

interface ImageAssetSource {
  path: string;
  url: string;
}

export class AssetCatalog {
  private readonly images = new Map<string, RenderableImageAsset>();
  private readonly animations = new Map<string, ImageAnimationAsset>();
  private readonly fonts = new Map<string, FontAssetDefinition>();
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

  registerFonts(definitions: readonly FontAssetDefinition[]): void {
    for (const definition of definitions) this.registerFont(definition);
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

  fontFamily(id: string): string {
    return this.fonts.get(id)?.family ?? id;
  }

  hasImage(id: string): boolean {
    return this.images.has(id);
  }

  hasFont(id: string): boolean {
    return this.fonts.has(id);
  }

  async ensureDebugImageAsset(definition: DebugImageAssetSourceDefinition): Promise<void> {
    if (this.images.has(definition.id)) return;

    const sourceImageId = definition.frameKey ? sourceImageIdForFrameId(definition.id) : definition.id;
    if (!this.images.has(sourceImageId)) await this.registerExternalImage(sourceImageId, definition.path, definition.url);

    if (!definition.frameKey) return;
    if (this.images.has(definition.id)) return;
    if (!definition.rect) throw new Error(`Debug image frame '${definition.id}' needs a rect`);

    const texture = this.scene.textures.get(sourceImageId);
    if (!texture.has(definition.frameKey)) {
      texture.add(definition.frameKey, 0, definition.rect.x, definition.rect.y, definition.rect.width, definition.rect.height);
    }
    this.images.set(definition.id, {
      kind: ImageAssetKind.Frame,
      id: definition.id,
      textureKey: sourceImageId,
      frameKey: definition.frameKey,
      sourceImageId,
      rect: definition.rect,
      width: definition.rect.width,
      height: definition.rect.height,
    } satisfies FrameAsset);
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

  listDebugFonts(): DebugFontAssetDescriptor[] {
    return [...this.fonts.values()].map((font) => ({
      id: font.key,
      family: font.family,
      label: font.label,
      path: font.path,
      weight: font.weight,
      style: font.style,
    }));
  }

  private async registerExternalImage(id: string, path: string, url?: string): Promise<void> {
    if (this.images.has(id)) return;
    const resolvedUrl = new URL(url ?? path, window.location.origin).toString();
    const image = await loadHtmlImage(resolvedUrl);
    if (!this.scene.textures.exists(id)) this.scene.textures.addImage(id, image);
    this.images.set(id, {
      kind: ImageAssetKind.Image,
      id,
      textureKey: id,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    });
    this.imageSources.set(id, { path, url: resolvedUrl });
    console.info('[Game Core Assets] registered lazy debug image asset', { id, path, url: resolvedUrl });
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
    this.imageSources.set(definition.key, { path: definition.path, url: resolveAssetUrl(definition.path) });

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

  private registerFont(definition: FontAssetDefinition): void {
    if (this.fonts.has(definition.key)) return;
    this.fonts.set(definition.key, definition);
    if (typeof FontFace === 'undefined' || !document.fonts) return;

    const face = new FontFace(definition.family, `url(${resolveAssetUrl(definition.path)})`, {
      weight: definition.weight ?? '400',
      style: definition.style ?? 'normal',
      display: 'swap',
    });
    document.fonts.add(face);
    void face.load().catch((error) => console.warn('[Game Core Assets] font failed to load', definition, error));
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

function sourceImageIdForFrameId(id: string): string {
  return id.includes('#') ? id.slice(0, id.lastIndexOf('#')) : id;
}

function resolveAssetUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Image '${url}' konnte nicht geladen werden`));
    image.src = url;
  });
}

