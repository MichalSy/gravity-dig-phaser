import type { Rect } from './imageAssets';

export interface ImageAtlasFrameMeta extends Rect {}

export interface ImageAtlasAnimationMeta {
  frames: string[];
  fps: number;
  loop?: boolean;
}

export interface ImageAtlasMeta {
  frames?: Record<string, ImageAtlasFrameMeta>;
  animations?: Record<string, ImageAtlasAnimationMeta>;
}

export function imageAtlasMetaKey(imageKey: string): string {
  return `${imageKey}.json`;
}

export function imageAtlasMetaPath(imagePath: string): string {
  return `${imagePath}.json`;
}
