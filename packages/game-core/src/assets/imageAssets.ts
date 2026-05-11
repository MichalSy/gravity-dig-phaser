export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ImageAssetKind = {
  Image: 'image',
  Frame: 'frame',
  Animation: 'animation',
} as const;

export type ImageAssetKind = (typeof ImageAssetKind)[keyof typeof ImageAssetKind];

export interface ImageAsset {
  kind: typeof ImageAssetKind.Image;
  id: string;
  textureKey: string;
  width: number;
  height: number;
}

export interface FrameAsset {
  kind: typeof ImageAssetKind.Frame;
  id: string;
  textureKey: string;
  frameKey: string;
  sourceImageId: string;
  rect: Rect;
  width: number;
  height: number;
}

export type RenderableImageAsset = ImageAsset | FrameAsset;

export interface ImageAnimationFrameAsset {
  asset: RenderableImageAsset;
  durationMs?: number;
}

export interface ImageAnimationAsset {
  kind: typeof ImageAssetKind.Animation;
  id: string;
  setId?: string;
  animationId?: string;
  frames: ImageAnimationFrameAsset[];
  fps: number;
  loop: boolean;
}

export function isFrameAsset(asset: RenderableImageAsset): asset is FrameAsset {
  return asset.kind === ImageAssetKind.Frame;
}
