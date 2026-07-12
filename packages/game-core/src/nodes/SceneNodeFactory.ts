import { ImageNode, type ImageNodeOptions } from './ImageNode';
import { TextNode, type TextNodeOptions } from './TextNode';
import type { GameNode, NodeCreationMetadata } from './GameNode';
import type { PrefabManager } from './PrefabManager';

export interface SceneNodeJson {
  /** Static node type identifier. All ImageNode instances share the same nodeTypeId. */
  nodeTypeId?: string;
  /** Stable scene instance identifier. Persist this when another node needs a durable reference. */
  instanceId?: string;
  name?: string;
  prefab?: string;
  props?: Record<string, unknown>;
  /** Sparse per-node authoring overrides keyed by prefab-relative node path. */
  overrides?: Record<string, Record<string, unknown>>;
  /** Runtime-only metadata populated while resolving a prefab. */
  prefabOverrideProps?: string[];
  /** Runtime-only source name used for stable prefab-relative paths when an instance is renamed. */
  prefabSourceName?: string;
  /** Runtime-only stable identity of the source node inside the prefab definition. */
  prefabSourceInstanceId?: string;
  children?: SceneNodeJson[];
}

export interface SceneFileJson {
  version: 1;
  root: SceneNodeJson;
}

export interface EditorPreviewSetPropsChange {
  kind: 'setProps';
  target: { nodePath: string[] };
  props: Record<string, unknown>;
}

type SceneNodeFactory = (definition: SceneNodeJson) => GameNode;
type PrefabResolver = (path: string) => SceneFileJson;

function cloneDefinition(definition: SceneNodeJson): SceneNodeJson {
  return JSON.parse(JSON.stringify(definition)) as SceneNodeJson;
}

function mergePrefabDefinition(base: SceneNodeJson, override: SceneNodeJson): SceneNodeJson {
  const merged: SceneNodeJson = {
    ...base,
    ...override,
    nodeTypeId: getDefinitionNodeTypeId(base),
    instanceId: undefined,
    prefab: undefined,
    overrides: undefined,
    prefabOverrideProps: Object.keys(override.props ?? {}),
    prefabSourceName: base.name,
    prefabSourceInstanceId: base.prefabSourceInstanceId,
    props: mergePropertyValues(base.props ?? {}, override.props ?? {}),
    children: override.children ?? base.children,
  };
  applyNestedPrefabOverrides(merged, override.overrides ?? {}, []);
  return merged;
}

function applyNestedPrefabOverrides(node: SceneNodeJson, overrides: Record<string, Record<string, unknown>>, path: string[]): void {
  const nodePath = [...path, node.name ?? getDefinitionNodeTypeId(node) ?? 'unnamed'];
  const key = nodePath.slice(1).join('/');
  const values = (node.prefabSourceInstanceId ? overrides[node.prefabSourceInstanceId] : undefined) ?? overrides[key];
  if (values) {
    node.props = mergePropertyValues(node.props ?? {}, values);
    node.prefabOverrideProps = Object.keys(values);
  }
  for (const child of node.children ?? []) applyNestedPrefabOverrides(child, overrides, nodePath);
}

export function mergePropertyValues(base: Record<string, unknown>, overrides: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const baseValue = result[key];
    result[key] = isPlainObject(baseValue) && isPlainObject(value) ? mergePropertyValues(baseValue, value) : value;
  }
  return result;
}

export function sparsePropertyOverrides(base: Record<string, unknown>, values: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const baseValue = base[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      const nested = sparsePropertyOverrides(baseValue, value);
      if (Object.keys(nested).length > 0) result[key] = nested;
    } else if (!propertyValuesEqual(baseValue, value)) {
      result[key] = value;
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function propertyValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => propertyValuesEqual(value, right[index]));
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].every((key) => propertyValuesEqual(left[key], right[key]));
  }
  return false;
}

export class SceneNodeFactoryRegistry {
  private readonly factories = new Map<string, SceneNodeFactory>();
  private prefabResolver?: PrefabResolver;
  private prefabManager?: PrefabManager;
  private previewChanges: readonly EditorPreviewSetPropsChange[] = [];

  withPrefabResolver(resolver: PrefabResolver): this {
    this.prefabResolver = resolver;
    return this;
  }

  withPrefabManager(manager: PrefabManager): this {
    this.prefabManager = manager;
    this.prefabResolver = (path) => manager.get(path);
    manager.onReload((path, definition) => this.applyReloadedPrefab(path, definition));
    return this;
  }

  withPreviewChanges(changes: readonly EditorPreviewSetPropsChange[] | undefined): this {
    this.previewChanges = changes ?? [];
    return this;
  }

  register(nodeTypeId: string, factory: SceneNodeFactory): this {
    this.factories.set(nodeTypeId, factory);
    return this;
  }

  registerImage(nodeTypeId: string): this {
    return this.register(nodeTypeId, (definition) => new ImageNode({ nodeTypeId: getDefinitionNodeTypeId(definition), instanceId: definition.instanceId, name: definition.name, ...(definition.props ?? {}) } as ImageNodeOptions));
  }

  registerText(nodeTypeId: string): this {
    return this.register(nodeTypeId, (definition) => new TextNode({ nodeTypeId: getDefinitionNodeTypeId(definition), instanceId: definition.instanceId, name: definition.name, ...(definition.props ?? {}) } as TextNodeOptions));
  }

  createTree(definition: SceneNodeJson, creation: NodeCreationMetadata = { origin: 'scene' }): GameNode {
    return this.createTreeAtPath(definition, [], creation, true, creation.prefabNodePath ?? []);
  }

  private createTreeAtPath(definition: SceneNodeJson, parentPath: string[], creation: NodeCreationMetadata, isRoot: boolean, inheritedPrefabNodePath: string[]): GameNode {
    const declaredPrefabPath = definition.prefab;
    const prefabPath = declaredPrefabPath ?? creation.prefabPath;
    const resolvedDefinition = this.resolvePrefab(definition);
    const nodeName = resolvedDefinition.name ?? getDefinitionNodeTypeId(resolvedDefinition) ?? 'unnamed';
    const nodePath = [...parentPath, nodeName];
    const effectiveDefinition = this.withStableInstanceId(this.applyPreviewProps(resolvedDefinition, nodePath), nodePath);
    const prefabNodeName = effectiveDefinition.prefabSourceName ?? nodeName;
    const prefabNodePath = prefabPath ? [...inheritedPrefabNodePath, prefabNodeName] : [];
    const factory = this.resolveFactory(effectiveDefinition);
    const node = factory(effectiveDefinition);
    node.setCreationMetadata({
      ...creation,
      runtimeRoot: creation.origin !== 'scene' && isRoot,
      prefabPath,
      prefabNodePath: prefabPath ? prefabNodePath : undefined,
      prefabNodeId: effectiveDefinition.prefabSourceInstanceId,
      prefabOverrideProps: effectiveDefinition.prefabOverrideProps ?? [],
    });
    applyInitialProps(node, effectiveDefinition.props);
    for (const child of effectiveDefinition.children ?? []) node.addChild(this.createTreeAtPath(child, nodePath, { ...creation, prefabPath }, false, prefabNodePath));
    node.ensureRequiredChildren();
    if (declaredPrefabPath) this.prefabManager?.register(declaredPrefabPath, node);
    return node;
  }

  private applyReloadedPrefab(path: string, _definition: SceneFileJson): void {
    for (const root of this.prefabManager?.getInstances(path) ?? []) this.applyReloadedPrefabNode(path, root);
  }

  private applyReloadedPrefabNode(path: string, node: GameNode): void {
    const metadata = node.getCreationMetadata();
    const definition = metadata.prefabNodeId ? this.prefabManager?.getNode(path, metadata.prefabNodeId) : undefined;
    if (definition?.props) {
      const overrideProps = new Set(metadata.prefabOverrideProps ?? []);
      const inheritedProps = Object.fromEntries(Object.entries(definition.props).filter(([key]) => !overrideProps.has(key)));
      applyInitialProps(node, inheritedProps);
    }
    for (const child of node.children) this.applyReloadedPrefabNode(path, child);
  }

  private resolvePrefab(definition: SceneNodeJson): SceneNodeJson {
    if (!definition.prefab) return definition;
    if (!this.prefabResolver) throw new Error(`No prefab resolver configured for '${definition.prefab}'`);
    const prefab = this.prefabResolver(definition.prefab);
    const source = cloneDefinition(prefab.root);
    preparePrefabSourceTree(source);
    return mergePrefabDefinition(source, definition);
  }

  private resolveFactory(definition: SceneNodeJson): SceneNodeFactory {
    const nodeTypeId = getDefinitionNodeTypeId(definition);
    if (!nodeTypeId) throw new Error(`Scene node '${definition.name ?? definition.instanceId ?? 'unnamed'}' needs a nodeTypeId`);
    const factory = this.factories.get(nodeTypeId);
    if (!factory) throw new Error(`No scene node factory registered for nodeTypeId '${nodeTypeId}' (${definition.name ?? 'unnamed'})`);
    return factory;
  }

  private applyPreviewProps(definition: SceneNodeJson, nodePath: string[]): SceneNodeJson {
    const matchingChanges = this.previewChanges.filter((change) => pathsEqual(change.target.nodePath, nodePath));
    if (matchingChanges.length === 0) return definition;
    return {
      ...definition,
      props: matchingChanges.reduce<Record<string, unknown>>((props, change) => ({ ...props, ...change.props }), { ...(definition.props ?? {}) }),
    };
  }

  private withStableInstanceId(definition: SceneNodeJson, nodePath: string[]): SceneNodeJson {
    return definition.instanceId ? definition : { ...definition, instanceId: stableSceneNodeInstanceId(nodePath) };
  }
}

export function stableSceneNodeInstanceId(nodePath: readonly string[]): string {
  return `scene:${nodePath.map((part) => encodeURIComponent(part)).join('/')}`;
}

export function getDefinitionNodeTypeId(definition: SceneNodeJson): string | undefined {
  return definition.nodeTypeId;
}

function pathsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function preparePrefabSourceTree(node: SceneNodeJson): void {
  node.prefabSourceName = node.name;
  node.prefabSourceInstanceId = node.instanceId;
  node.instanceId = undefined;
  for (const child of node.children ?? []) preparePrefabSourceTree(child);
}

function applyInitialProps(node: GameNode, props: Record<string, unknown> | undefined): void {
  if (!props) return;
  const mutableNode = node as GameNode & Record<string, unknown>;
  for (const [key, value] of Object.entries(props)) {
    if (!(key in mutableNode)) continue;

    if (key === 'scale' && isPointLike(value)) {
      mutableNode.scaleX = roundScale(value.x);
      mutableNode.scaleY = roundScale(value.y);
      mutableNode.scale = mutableNode.scaleX === mutableNode.scaleY ? mutableNode.scaleX : 1;
      continue;
    }

    mutableNode[key] = value;
  }
}

function isPointLike(value: unknown): value is { x: number; y: number } {
  return typeof value === 'object' && value !== null && typeof (value as { x?: unknown }).x === 'number' && typeof (value as { y?: unknown }).y === 'number';
}

function roundScale(value: number): number {
  return Number(value.toFixed(2));
}

export function collectNodesByName(root: GameNode, target = new Map<string, GameNode>()): Map<string, GameNode> {
  if (root.name && !target.has(root.name)) target.set(root.name, root);
  for (const child of root.children) collectNodesByName(child, target);
  return target;
}
