import type { DebugNodeDescriptor, DebugNodePatch, DebugNodePropsMessage, DebugSceneNodeDefinition, DebugScenePropDefinition } from '@gravity-dig/debug-protocol';

export interface PrefabNodeDefinition {
  nodeId: string;
  name?: string;
  nodeTypeId?: string;
  props?: Record<string, unknown>;
  children?: PrefabNodeDefinition[];
}

export interface PrefabDocument {
  version: number;
  prefabId: string;
  root: PrefabNodeDefinition;
}

const classNamesByTypeId: Record<string, string> = {
  'b78a74e0-452a-5e20-85f4-579f7c0b1364': 'TransformNode',
  '73e926f5-c280-5131-b820-a89f898e2d48': 'ImageNode',
  '2db287f7-b55c-5c58-be87-c057e8c5d302': 'TextNode',
  '5a0cd663-64c3-5f02-a579-9915605564be': 'AnimatedImageNode',
  'f3f82d6c-c31e-56bc-afd6-b5892604eaf5': 'CollisionRectNode',
};

export function isPrefabFilePath(path: string): boolean {
  return path.toLowerCase().endsWith('.prefab.json');
}

export function parsePrefabDocument(content: string): PrefabDocument {
  const value = JSON.parse(content) as Partial<PrefabDocument>;
  if (!value || typeof value !== 'object' || !value.root || typeof value.root !== 'object') throw new Error('Prefab enthält keinen gültigen root-Node.');
  const root = value.root as PrefabNodeDefinition;
  ensureNodeIds(root);
  return { version: typeof value.version === 'number' ? value.version : 1, prefabId: value.prefabId ?? crypto.randomUUID(), root };
}

export function prefabDocumentToTree(document: PrefabDocument, path: string): DebugNodeDescriptor[] {
  return [toDescriptor(document.root, undefined, 0, path, 'root')];
}

function toDescriptor(node: PrefabNodeDefinition, parentId: string | undefined, index: number, path: string, fallbackKey: string): DebugNodeDescriptor {
  const id = node.nodeId ?? `prefab:${path}:${fallbackKey}`;
  const nodeTypeId = node.nodeTypeId;
  const className = nodeTypeId ? classNamesByTypeId[nodeTypeId] ?? (nodeTypeId.startsWith('dynamic.') ? 'DynamicScriptNode' : 'GameNode') : 'TransformNode';
  const active = node.props?.active !== false;
  const visible = node.props?.visible !== false;
  return {
    id,
    instanceId: node.nodeId,
    parentId,
    nodeTypeId,
    name: node.name ?? className,
    className,
    active,
    effectiveActive: active,
    visible,
    index,
    children: (node.children ?? []).map((child, childIndex) => toDescriptor(child, id, childIndex, path, `${fallbackKey}.${childIndex}`)),
  };
}

export function findPrefabTreeNodeByPath(roots: DebugNodeDescriptor[], nodePath: readonly string[]): DebugNodeDescriptor | undefined {
  if (nodePath.length === 0) return roots[0];
  let current = roots.find((node) => node.name === nodePath[0]);
  for (let index = 1; current && index < nodePath.length; index += 1) current = current.children.find((child) => child.name === nodePath[index]);
  return current;
}

export function prefabNodeDefinition(document: PrefabDocument, path: string, nodeId: string): DebugSceneNodeDefinition | undefined {
  const node = findPrefabNode(document.root, path, nodeId, 'root');
  if (!node) return undefined;
  const props = node.props ?? {};
  const exposedProps = Object.fromEntries(Object.entries(props).map(([key, value]) => [key, inferPropDefinition(key, value)]));
  return {
    instanceId: node.nodeId ?? nodeId,
    name: node.name ?? 'Prefab Node',
    typeName: node.nodeTypeId ?? 'TransformNode',
    exposedPropGroups: [{ name: 'Prefab Props', props: exposedProps }],
    overlayLayers: [],
  };
}

function inferPropDefinition(key: string, value: unknown): DebugScenePropDefinition {
  if (key === 'position') return { type: 'Position' };
  if (key === 'size') return { type: 'Size' };
  if (key === 'origin') return { type: 'Origin' };
  if (key === 'scale') return { type: 'Scale' };
  if (key === 'assetId') return { type: 'AssetId' };
  if (key === 'fontId') return { type: 'FontId' };
  if (/nodeId$/i.test(key)) return { type: 'NodeRef' };
  if (/nodeIds$/i.test(key)) return { type: 'NodeRefList' };
  if (typeof value === 'boolean') return { type: 'Boolean' };
  if (typeof value === 'number') return { type: 'Number' };
  return { type: 'String' };
}

export function prefabNodePropsMessage(document: PrefabDocument, path: string, nodeId: string): DebugNodePropsMessage | undefined {
  const node = findPrefabNode(document.root, path, nodeId, 'root');
  if (!node) return undefined;
  const props = node.props ?? {};
  const position = objectPair(props.position, 'x', 'y', 0, 0);
  const size = objectPair(props.size, 'width', 'height', 0, 0);
  const origin = objectPair(props.origin, 'x', 'y', 0, 0);
  const scaleValue = props.scale;
  const scale = typeof scaleValue === 'number' ? { x: scaleValue, y: scaleValue } : objectPair(scaleValue, 'x', 'y', 1, 1);
  const scalarProps = Object.fromEntries(Object.entries(props).filter(([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value) || Array.isArray(value))) as DebugNodePropsMessage['props'];
  return {
    type: 'node:props',
    sessionId: `prefab:${path}`,
    nodeId,
    instanceId: node.nodeId,
    localTransform: {
      x: position.x,
      y: position.y,
      width: size.x,
      height: size.y,
      originX: origin.x,
      originY: origin.y,
      rotation: typeof props.rotation === 'number' ? props.rotation : 0,
      scaleX: scale.x,
      scaleY: scale.y,
    },
    props: scalarProps,
    sentAt: Date.now(),
  };
}

export function patchPrefabNode(document: PrefabDocument, path: string, nodeId: string, patch: DebugNodePatch): PrefabDocument {
  const copy = structuredClone(document);
  const node = findPrefabNode(copy.root, path, nodeId, 'root');
  if (!node) throw new Error(`Prefab-Node '${nodeId}' wurde nicht gefunden.`);
  node.props = { ...(node.props ?? {}), ...patch };
  return copy;
}

export function formatPrefabDocument(document: PrefabDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

function findPrefabNode(node: PrefabNodeDefinition, path: string, id: string, fallbackKey: string): PrefabNodeDefinition | undefined {
  const nodeId = node.nodeId ?? `prefab:${path}:${fallbackKey}`;
  if (nodeId === id) return node;
  for (let index = 0; index < (node.children ?? []).length; index += 1) {
    const match = findPrefabNode(node.children![index], path, id, `${fallbackKey}.${index}`);
    if (match) return match;
  }
  return undefined;
}

function ensureNodeIds(node: PrefabNodeDefinition): void {
  node.nodeId ||= crypto.randomUUID();
  for (const child of node.children ?? []) ensureNodeIds(child);
}

function objectPair(value: unknown, first: string, second: string, fallbackFirst: number, fallbackSecond: number): { x: number; y: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { x: fallbackFirst, y: fallbackSecond };
  const record = value as Record<string, unknown>;
  return {
    x: typeof record[first] === 'number' ? record[first] : fallbackFirst,
    y: typeof record[second] === 'number' ? record[second] : fallbackSecond,
  };
}
