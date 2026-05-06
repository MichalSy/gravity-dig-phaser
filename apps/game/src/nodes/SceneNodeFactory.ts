import { AnimatedImageNode, type AnimatedImageNodeOptions } from './AnimatedImageNode';
import { CollisionRectNode, type CollisionRectNodeOptions } from './CollisionRectNode';
import { ImageNode, type ImageNodeOptions } from './ImageNode';
import { SceneNode, type SceneNodeOptions } from './SceneNode';
import { TextNode, type TextNodeOptions } from './TextNode';
import type { GameNode } from './GameNode';

export interface SceneNodeJson {
  id?: string;
  type?: string;
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
    prefab: undefined,
    props: { ...(base.props ?? {}), ...(override.props ?? {}) },
    children: override.children ?? base.children,
  };
}

export class SceneNodeFactoryRegistry {
  private readonly factoriesByGuid = new Map<string, SceneNodeFactory>();
  private readonly factoriesByType = new Map<string, SceneNodeFactory>();
  private prefabResolver?: PrefabResolver;

  constructor() {
    this.registerType('SceneNode', (definition) => new SceneNode({ guid: definition.id, rootName: definition.name ?? 'Scene', ...(definition.props ?? {}) } as SceneNodeOptions));
    this.registerType('ImageNode', (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ImageNodeOptions));
    this.registerType('TextNode', (definition) => new TextNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as TextNodeOptions));
    this.registerType('AnimatedImageNode', (definition) => new AnimatedImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as AnimatedImageNodeOptions));
    this.registerType('CollisionRectNode', (definition) => new CollisionRectNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as CollisionRectNodeOptions));
  }

  withPrefabResolver(resolver: PrefabResolver): this {
    this.prefabResolver = resolver;
    return this;
  }

  registerType(type: string, factory: SceneNodeFactory): this {
    this.factoriesByType.set(type, factory);
    return this;
  }

  registerImage(guid: string): this {
    this.factoriesByGuid.set(guid, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ImageNodeOptions));
    return this;
  }

  registerText(guid: string): this {
    this.factoriesByGuid.set(guid, (definition) => new TextNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as TextNodeOptions));
    return this;
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
    if (definition.type) {
      const factory = this.factoriesByType.get(definition.type);
      if (!factory) throw new Error(`No scene node factory registered for type '${definition.type}' (${definition.name ?? definition.id ?? 'unnamed'})`);
      return factory;
    }

    if (definition.id) {
      const factory = this.factoriesByGuid.get(definition.id);
      if (factory) return factory;
    }

    throw new Error(`Scene node '${definition.name ?? definition.id ?? 'unnamed'}' needs a type or registered id factory`);
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
