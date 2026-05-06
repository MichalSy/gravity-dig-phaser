import type { DebugNodePatch } from '@gravity-dig/debug-protocol';
import { GameNode, type GameNodeOptions } from './GameNode';
import { propNumber, type EditablePropMap } from './SceneProps';

export interface TransformNodeOptions extends GameNodeOptions {
  depth?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  scrollFactor?: number;
}

export abstract class TransformNode extends GameNode {
  static override readonly sceneType: string = 'TransformNode';
  static override readonly editableProps: EditablePropMap = {
    ...GameNode.editableProps,
    depth: propNumber({ label: 'Depth', step: 0.1 }),
    scale: propNumber({ label: 'Scale', step: 0.01 }),
    scaleX: propNumber({ label: 'Scale X', step: 0.01 }),
    scaleY: propNumber({ label: 'Scale Y', step: 0.01 }),
    scrollFactor: propNumber({ label: 'Scroll Factor', step: 0.01 }),
  };

  depth: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  scrollFactor: number;

  protected constructor(options: TransformNodeOptions = {}) {
    super(options);
    this.depth = options.depth ?? 0;
    this.scale = options.scale ?? 1;
    this.scaleX = options.scaleX ?? this.scale;
    this.scaleY = options.scaleY ?? this.scale;
    this.scrollFactor = options.scrollFactor ?? 1;
  }

  override getLocalScale(): { x: number; y: number } {
    return { x: this.scaleX, y: this.scaleY };
  }

  protected override applySceneProp(key: string, value: DebugNodePatch[string]): boolean {
    switch (key) {
      case 'depth':
        if (typeof value !== 'number') return false;
        this.depth = value;
        return true;
      case 'scale':
        if (typeof value !== 'number') return false;
        this.scale = value;
        this.scaleX = value;
        this.scaleY = value;
        return true;
      case 'scaleX':
        if (typeof value !== 'number') return false;
        this.scaleX = value;
        return true;
      case 'scaleY':
        if (typeof value !== 'number') return false;
        this.scaleY = value;
        return true;
      case 'scrollFactor':
        if (typeof value !== 'number') return false;
        this.scrollFactor = value;
        return true;
      default:
        return super.applySceneProp(key, value);
    }
  }
}
