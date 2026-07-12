import { ImageNode, type ImageNodeOptions } from './ImageNode';
import { TextNode, type TextNodeOptions } from './TextNode';
import type { GameNode, NodeCreationMetadata } from './GameNode';
import type { PrefabManager } from './PrefabManager';

export interface SceneNodeJson {
  /** Static node type identifier. All ImageNode instances share the same nodeTypeId. */
  nodeTypeId?: string;
  /** Stable scene instance identifier. Persist this when another node needs a durable reference. */
  instanceId?: string;
  /** Stable identity inside a prefab definition. Not used as a runtime instanceId. */
  nodeId?: string;
  name?: string;
  prefab?: string;
  prefabId?: string;
  props?: Record<string, unknown>;
  /** Sparse per-node authoring overrides keyed by prefab-relative node path. */
  overrides?: Record<string, Record<string, unknown>>;
  /** Runtime-only metadata populated while resolving a prefab. */
  prefabOverrideProps?: string[];
  /** Runtime-only source name used for stable prefab-relative paths when an instance is renamed. */
  prefabSourceName?: string;
  /** Runtime-only stable identity of the source node inside the prefab definition. */
  prefabSourceNodeId?: string;
  prefabSourcePrefabId?: string;
  children?: SceneNodeJson[];
}

export interface SceneFileJson {
  version: 1;
  prefabId?: string;
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
    prefabSourceNodeId: base.prefabSourceNodeId,
    prefabSourcePrefabId: base.prefabSourcePrefabId,
    props: mergePropertyValues(base.props ?? {}, override.props ?? {}),
    children: override.children ?? base.children,
  };
  applyNestedPrefabOverrides(merged, override.overrides ?? {}, []);
  return merged;
}

function applyNestedPrefabOverrides(node: SceneNodeJson, overrides: Record<string, Record<string, unknown>>, path: string[]): void {
  const nodePath = [...path, node.name ?? getDefinitionNodeTypeId(node) ?? 'unnamed'];
  const key = nodePath.slice(1).join('/');
  const values = (node.prefabSourceNodeId ? overrides[node.prefabSourceNodeId] : undefined) ?? overrides[key];
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

  createPrefab(prefabId: string, options: { name?: string; props?: Record<string, unknown> } = {}, creation: NodeCreationMetadata = { origin: 'runtime-code' }): GameNode {
    if (!this.prefabManager) throw new Error(`No prefab manager configured for '${prefabId}'`);
    return this.prefabManager.instantiate(prefabId, (path) => this.createTree(
      { prefab: path, prefabId, name: options.name, props: options.props },
      { ...creation, prefabId, prefabPath: path },
    ));
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
    const effectiveDefinition = this.withRuntimeInstanceId(this.applyPreviewProps(resolvedDefinition, nodePath), nodePath);
    const prefabNodeName = effectiveDefinition.prefabSourceName ?? nodeName;
    const prefabNodePath = prefabPath ? [...inheritedPrefabNodePath, prefabNodeName] : [];
    const factory = this.resolveFactory(effectiveDefinition);
    const node = factory(effectiveDefinition);
    node.setCreationMetadata({
      ...creation,
      runtimeRoot: creation.origin !== 'scene' && isRoot,
      prefabPath,
      prefabId: effectiveDefinition.prefabSourcePrefabId,
      prefabNodePath: prefabPath ? prefabNodePath : undefined,
      prefabNodeId: effectiveDefinition.prefabSourceNodeId,
      prefabOverrideProps: effectiveDefinition.prefabOverrideProps ?? [],
    });
    applyInitialProps(node, effectiveDefinition.props);
    for (const child of effectiveDefinition.children ?? []) node.addChild(this.createTreeAtPath(child, nodePath, { ...creation, prefabPath }, false, prefabNodePath));
    node.ensureRequiredChildren();
    if (declaredPrefabPath) {
      this.remapPrefabNodeReferences(declaredPrefabPath, node);
      this.prefabManager?.register(declaredPrefabPath, node);
      node.onDestroyed(() => this.prefabManager?.unregister(declaredPrefabPath, node));
    }
    return node;
  }

  private remapPrefabNodeReferences(path: string, root: GameNode): void {
    const runtimeByNodeId = new Map<string, GameNode>();
    const collect = (node: GameNode): void => {
      const nodeId = node.getCreationMetadata().prefabNodeId;
      if (nodeId) runtimeByNodeId.set(nodeId, node);
      for (const child of node.children) collect(child);
    };
    collect(root);
    const apply = (node: GameNode): void => {
      const nodeId = node.getCreationMetadata().prefabNodeId;
      const source = nodeId ? this.prefabManager?.getNode(path, nodeId) : undefined;
      if (source?.props) {
        const mapped = Object.fromEntries(Object.entries(source.props).map(([key, value]) => [key, mapNodeReferenceValue(key, value, runtimeByNodeId)]));
        applyInitialProps(node, mapped);
      }
      for (const child of node.children) apply(child);
    };
    apply(root);
  }

  private applyReloadedPrefab(path: string, definition: SceneFileJson): void {
    for (const root of this.prefabManager?.getInstances(path) ?? []) this.reconcilePrefabInstance(path, definition, root);
  }

  private reconcilePrefabInstance(path: string, prefab: SceneFileJson, root: GameNode): void {
    const runtimeByNodeId = new Map<string, GameNode>();
    const collectRuntime = (node: GameNode): void => {
      const nodeId = node.getCreationMetadata().prefabNodeId;
      if (nodeId) runtimeByNodeId.set(nodeId, node);
      for (const child of node.children) collectRuntime(child);
    };
    collectRuntime(root);

    const definitions = new Map<string, { node: SceneNodeJson; parentId?: string; index: number }>();
    const collectDefinitions = (node: SceneNodeJson, parentId: string | undefined, index: number): void => {
      if (!node.nodeId) return;
      definitions.set(node.nodeId, { node, parentId, index });
      node.children?.forEach((child, childIndex) => collectDefinitions(child, node.nodeId, childIndex));
    };
    collectDefinitions(prefab.root, undefined, 0);

    for (const [nodeId, runtimeNode] of [...runtimeByNodeId]) {
      if (definitions.has(nodeId) || runtimeNode === root) continue;
      runtimeNode.parent?.removeChild(runtimeNode);
      runtimeByNodeId.delete(nodeId);
    }

    const ensureNode = (nodeId: string): GameNode | undefined => {
      const existing = runtimeByNodeId.get(nodeId);
      if (existing) return existing;
      const entry = definitions.get(nodeId);
      if (!entry?.parentId) return root;
      const parent = ensureNode(entry.parentId);
      if (!parent) return undefined;
      const source = cloneDefinition(entry.node);
      preparePrefabSourceTree(source, prefab.prefabId);
      const parentPath = gameNodePath(parent);
      const created = this.createTreeAtPath(source, parentPath, { ...root.getCreationMetadata(), prefabPath: path }, false, parent.getCreationMetadata().prefabNodePath ?? []);
      parent.insertChildAt(created, entry.index);
      collectRuntime(created);
      return created;
    };

    for (const nodeId of definitions.keys()) ensureNode(nodeId);
    for (const [nodeId, entry] of definitions) {
      const runtimeNode = runtimeByNodeId.get(nodeId);
      if (!runtimeNode) continue;
      this.applyReloadedPrefabNode(path, runtimeNode);
      if (!entry.parentId || runtimeNode === root) continue;
      const expectedParent = runtimeByNodeId.get(entry.parentId);
      if (!expectedParent) continue;
      if (runtimeNode.parent !== expectedParent || expectedParent.children[entry.index] !== runtimeNode) {
        runtimeNode.parent?.detachChildForMove(runtimeNode);
        expectedParent.insertChildAt(runtimeNode, entry.index);
      }
    }
    this.remapPrefabNodeReferences(path, root);
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
    if (definition.prefabId && prefab.prefabId !== definition.prefabId) throw new Error(`Prefab id mismatch for '${definition.prefab}'`);
    const source = cloneDefinition(prefab.root);
    preparePrefabSourceTree(source, prefab.prefabId);
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

  private withRuntimeInstanceId(definition: SceneNodeJson, nodePath: string[]): SceneNodeJson {
    if (definition.instanceId) return definition;
    if (definition.prefabSourcePrefabId && definition.prefabSourceNodeId && this.prefabManager) {
      return { ...definition, instanceId: this.prefabManager.allocateRuntimeInstanceId(definition.prefabSourcePrefabId, definition.prefabSourceNodeId) };
    }
    return { ...definition, instanceId: stableSceneNodeInstanceId(nodePath) };
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

function preparePrefabSourceTree(node: SceneNodeJson, prefabId: string | undefined): void {
  node.prefabSourceName = node.name;
  node.prefabSourceNodeId = node.nodeId;
  node.prefabSourcePrefabId = prefabId;
  for (const child of node.children ?? []) preparePrefabSourceTree(child, prefabId);
}

function mapNodeReferenceValue(key: string, value: unknown, runtimeByNodeId: ReadonlyMap<string, GameNode>): unknown {
  if (/nodeId$/i.test(key) && typeof value === 'string') return runtimeByNodeId.get(value)?.instanceId ?? value;
  if (/nodeIds$/i.test(key) && Array.isArray(value)) return value.map((item) => typeof item === 'string' ? runtimeByNodeId.get(item)?.instanceId ?? item : item);
  return value;
}

function gameNodePath(node: GameNode): string[] {
  const result: string[] = [];
  for (let current: GameNode | undefined = node; current; current = current.parent) result.unshift(current.name ?? current.nodeTypeId);
  return result;
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
