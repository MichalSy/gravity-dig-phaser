export interface AnimationSetFrameMeta {
  asset: string;
  durationMs?: number;
}

export interface AnimationSetClipMeta {
  fps?: number;
  loop?: boolean;
  frames: AnimationSetFrameMeta[];
}

export interface AnimationSetMeta {
  schema: 'animation-set';
  version: 1;
  id: string;
  defaultAnimation?: string;
  animations: Record<string, AnimationSetClipMeta>;
}

export interface AnimationSetDefinition {
  key: string;
  path: string;
}

export function animationSetMetaKey(key: string): string {
  return `${key}.animation.json`;
}
