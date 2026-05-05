export type Anchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

export interface SizeLike {
  width: number;
  height: number;
}

export interface PointLike {
  x: number;
  y: number;
}

export function anchorOffset(anchor: Anchor, size: SizeLike): PointLike {
  switch (anchor) {
    case 'top-left':
      return { x: 0, y: 0 };
    case 'top-center':
      return { x: size.width / 2, y: 0 };
    case 'top-right':
      return { x: size.width, y: 0 };
    case 'center-left':
      return { x: 0, y: size.height / 2 };
    case 'center':
      return { x: size.width / 2, y: size.height / 2 };
    case 'center-right':
      return { x: size.width, y: size.height / 2 };
    case 'bottom-left':
      return { x: 0, y: size.height };
    case 'bottom-center':
      return { x: size.width / 2, y: size.height };
    case 'bottom-right':
      return { x: size.width, y: size.height };
  }
}
