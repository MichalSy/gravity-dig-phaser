import { ImageNode, type ImageNodeOptions } from './ImageNode';
import { TextNode, type TextNodeOptions } from './TextNode';
import type { GameNode } from './GameNode';

export interface SceneNodeJson {
  id: string;
  name?: string;
  prefab?: string;
  props?: Record<string, unknown>;
  children?: SceneNodeJson[];
}

export interface SceneFileJson {
  version: 1;
  root: SceneNodeJson;
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
    id: base.id,
    prefab: undefined,
    props: { ...(base.props ?? {}), ...(override.props ?? {}) },
    children: override.children ?? base.children,
  };
}

export class SceneNodeFactoryRegistry {
  private readonly factories = new Map<string, SceneNodeFactory>();
  private prefabResolver?: PrefabResolver;

  withPrefabResolver(resolver: PrefabResolver): this {
    this.prefabResolver = resolver;
    return this;
  }

  register(guid: string, factory: SceneNodeFactory): this {
    this.factories.set(guid, factory);
    return this;
  }

  registerImage(guid: string): this {
    return this.register(guid, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ImageNodeOptions));
  }

  registerText(guid: string): this {
    return this.register(guid, (definition) => new TextNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as TextNodeOptions));
  }

  createTree(definition: SceneNodeJson): GameNode {
    const resolvedDefinition = this.resolvePrefab(definition);
    const factory = this.resolveFactory(resolvedDefinition);
    const node = factory(resolvedDefinition);
    applyInitialProps(node, resolvedDefinition.props);
    for (const child of resolvedDefinition.children ?? []) node.addChild(this.createTree(child));
    return node;
  }

  private resolvePrefab(definition: SceneNodeJson): SceneNodeJson {
    if (!definition.prefab) return definition;
    if (!this.prefabResolver) throw new Error(`No prefab resolver configured for '${definition.prefab}'`);
    const prefab = this.prefabResolver(definition.prefab);
    return mergePrefabDefinition(cloneDefinition(prefab.root), definition);
  }

  private resolveFactory(definition: SceneNodeJson): SceneNodeFactory {
    const factory = this.factories.get(definition.id);
    if (!factory) throw new Error(`No scene node factory registered for '${definition.id}' (${definition.name ?? 'unnamed'})`);
    return factory;
  }
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
