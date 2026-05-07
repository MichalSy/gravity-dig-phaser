import { ImageNode, type ImageNodeOptions } from './ImageNode';
import { TextNode, type TextNodeOptions } from './TextNode';
import type { GameNode } from './GameNode';

export interface SceneNodeJson {
  /** Static node type identifier. All ImageNode instances share the same nodeTypeId. */
  nodeTypeId?: string;
  /** @deprecated legacy alias for nodeTypeId. Public JSON must not use this. */
  id?: string;
  /** Runtime-only instance identifier. Public JSON must not use this. */
  instanceId?: string;
  name?: string;
  prefab?: string;
  props?: Record<string, unknown>;
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
  return {
    ...base,
    ...override,
    nodeTypeId: getDefinitionNodeTypeId(base),
    id: undefined,
    instanceId: undefined,
    prefab: undefined,
    props: { ...(base.props ?? {}), ...(override.props ?? {}) },
    children: override.children ?? base.children,
  };
}

export class SceneNodeFactoryRegistry {
  private readonly factories = new Map<string, SceneNodeFactory>();
  private prefabResolver?: PrefabResolver;
  private previewChanges: readonly EditorPreviewSetPropsChange[] = [];

  withPrefabResolver(resolver: PrefabResolver): this {
    this.prefabResolver = resolver;
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

  createTree(definition: SceneNodeJson): GameNode {
    return this.createTreeAtPath(definition, []);
  }

  private createTreeAtPath(definition: SceneNodeJson, parentPath: string[]): GameNode {
    const resolvedDefinition = this.resolvePrefab(definition);
    const nodePath = [...parentPath, resolvedDefinition.name ?? getDefinitionNodeTypeId(resolvedDefinition) ?? 'unnamed'];
    const effectiveDefinition = this.applyPreviewProps(resolvedDefinition, nodePath);
    const factory = this.resolveFactory(effectiveDefinition);
    const node = factory(effectiveDefinition);
    applyInitialProps(node, effectiveDefinition.props);
    for (const child of effectiveDefinition.children ?? []) node.addChild(this.createTreeAtPath(child, nodePath));
    return node;
  }

  private resolvePrefab(definition: SceneNodeJson): SceneNodeJson {
    if (!definition.prefab) return definition;
    if (!this.prefabResolver) throw new Error(`No prefab resolver configured for '${definition.prefab}'`);
    const prefab = this.prefabResolver(definition.prefab);
    return mergePrefabDefinition(cloneDefinition(prefab.root), definition);
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
}

export function getDefinitionNodeTypeId(definition: SceneNodeJson): string | undefined {
  return definition.nodeTypeId ?? definition.id;
}

function pathsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function applyInitialProps(node: GameNode, props: Record<string, unknown> | undefined): void {
  if (!props) return;
  const mutableNode = node as GameNode & Record<string, unknown>;
  for (const [key, value] of Object.entries(props)) {
    if (key in mutableNode) mutableNode[key] = value;
  }
}

export function collectNodesByName(root: GameNode, target = new Map<string, GameNode>()): Map<string, GameNode> {
  if (root.name) target.set(root.name, root);
  for (const child of root.children) collectNodesByName(child, target);
  return target;
}
