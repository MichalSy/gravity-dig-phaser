export const ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;

export type Anchor = typeof ANCHORS[number];

export interface SizeLike {
  width: number;
  height: number;
}

export interface PointLike {
  x: number;
  y: number;
}

export function anchorOrigin(anchor: Anchor): PointLike {
  switch (anchor) {
    case 'top-left':
      return { x: 0, y: 0 };
    case 'top-center':
      return { x: 0.5, y: 0 };
    case 'top-right':
      return { x: 1, y: 0 };
    case 'center-left':
      return { x: 0, y: 0.5 };
    case 'center':
      return { x: 0.5, y: 0.5 };
    case 'center-right':
      return { x: 1, y: 0.5 };
    case 'bottom-left':
      return { x: 0, y: 1 };
    case 'bottom-center':
      return { x: 0.5, y: 1 };
    case 'bottom-right':
      return { x: 1, y: 1 };
  }
}

export function anchorOffset(anchor: Anchor, size: SizeLike): PointLike {
  const origin = anchorOrigin(anchor);
  return { x: origin.x * size.width, y: origin.y * size.height };
}
