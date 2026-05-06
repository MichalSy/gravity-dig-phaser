import type { DebugNodePatch, DebugScenePropDefinition, DebugScenePropGroup, DebugScenePropRecordDefinition, DebugScenePropValue } from '@gravity-dig/debug-protocol';
import { ANCHORS, type Anchor, type PointLike, type SizeLike } from './Anchor';

export const SCENE_PROP_RECORDS = {
  String: { type: 'String', label: 'Text', editor: 'text' },
  Number: { type: 'Number', label: 'Number', editor: 'number' },
  Boolean: { type: 'Boolean', label: 'Boolean', editor: 'checkbox' },
  Position: {
    type: 'Position',
    label: 'Position',
    editor: 'xy',
    fields: {
      x: { type: 'Number', label: 'X', step: 1 },
      y: { type: 'Number', label: 'Y', step: 1 },
    },
  },
  Size: {
    type: 'Size',
    label: 'Size',
    editor: 'size',
    fields: {
      width: { type: 'Number', label: 'Width', min: 0, step: 1 },
      height: { type: 'Number', label: 'Height', min: 0, step: 1 },
    },
  },
  Origin: {
    type: 'Origin',
    label: 'Origin',
    editor: 'xy',
    fields: {
      x: { type: 'Number', label: 'X', min: 0, max: 1, step: 0.01 },
      y: { type: 'Number', label: 'Y', min: 0, max: 1, step: 0.01 },
    },
  },
  Anchor: { type: 'Anchor', label: 'Anchor', editor: 'anchor-grid', options: ANCHORS },
  AssetId: { type: 'AssetId', label: 'Asset', editor: 'asset-picker' },
} satisfies Record<string, DebugScenePropRecordDefinition>;

export type ExposedPropMap = Record<string, DebugScenePropDefinition>;
export type ExposedPropGroup = DebugScenePropGroup;

export function exposedPropGroup(name: string, props: ExposedPropMap): ExposedPropGroup {
  return { name, props };
}

export function flattenExposedPropGroups(groups: readonly ExposedPropGroup[]): ExposedPropMap {
  return Object.fromEntries(groups.flatMap((group) => Object.entries(group.props)));
}

export interface ScenePatchResult {
  applied: DebugNodePatch;
  rejected: Record<string, string>;
}

export function propString(options: Omit<DebugScenePropDefinition, 'type'> = {}): DebugScenePropDefinition {
  return { type: 'String', ...options };
}

export function propNumber(options: Omit<DebugScenePropDefinition, 'type'> = {}): DebugScenePropDefinition {
  return { type: 'Number', ...options };
}

export function propBoolean(options: Omit<DebugScenePropDefinition, 'type'> = {}): DebugScenePropDefinition {
  return { type: 'Boolean', ...options };
}

export function propPosition(options: Omit<DebugScenePropDefinition, 'type'> = {}): DebugScenePropDefinition {
  return { type: 'Position', ...options };
}

export function propSize(options: Omit<DebugScenePropDefinition, 'type'> = {}): DebugScenePropDefinition {
  return { type: 'Size', ...options };
}

export function propOrigin(options: Omit<DebugScenePropDefinition, 'type'> = {}): DebugScenePropDefinition {
  return { type: 'Origin', ...options };
}

export function propAnchor(options: Omit<DebugScenePropDefinition, 'type' | 'options'> = {}): DebugScenePropDefinition {
  return { type: 'Anchor', options: ANCHORS, ...options };
}

export function propAssetId(options: Omit<DebugScenePropDefinition, 'type'> = {}): DebugScenePropDefinition {
  return { type: 'AssetId', ...options };
}

export function validateScenePropValue(definition: DebugScenePropDefinition, value: unknown): DebugScenePropValue | undefined {
  if (definition.readOnly) return undefined;

  switch (definition.type) {
    case 'String':
    case 'AssetId':
      return typeof value === 'string' ? value : undefined;
    case 'Number':
      return typeof value === 'number' && Number.isFinite(value) ? clampNumber(value, definition) : undefined;
    case 'Boolean':
      return typeof value === 'boolean' ? value : undefined;
    case 'Anchor':
      return isAnchor(value) ? value : undefined;
    case 'Position':
    case 'Origin':
      return isPointLike(value) ? { x: clampNumber(value.x, definition), y: clampNumber(value.y, definition) } : undefined;
    case 'Size':
      return isSizeLike(value) ? { width: Math.max(0, clampNumber(value.width, definition)), height: Math.max(0, clampNumber(value.height, definition)) } : undefined;
  }
}

export function isAnchor(value: unknown): value is Anchor {
  return typeof value === 'string' && (ANCHORS as readonly string[]).includes(value);
}

export function isPointLike(value: unknown): value is PointLike {
  return typeof value === 'object' && value !== null && typeof (value as PointLike).x === 'number' && typeof (value as PointLike).y === 'number';
}

export function isSizeLike(value: unknown): value is SizeLike {
  return typeof value === 'object' && value !== null && typeof (value as SizeLike).width === 'number' && typeof (value as SizeLike).height === 'number';
}

function clampNumber(value: number, definition: DebugScenePropDefinition): number {
  const min = definition.min ?? Number.NEGATIVE_INFINITY;
  const max = definition.max ?? Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(min, value));
}
