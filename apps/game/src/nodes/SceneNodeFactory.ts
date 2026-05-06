import { ImageNode } from './ImageNode';
import { TextNode } from './TextNode';
import type { GameNode } from './GameNode';
import type { ImageNodeOptions } from './ImageNode';
import type { TextNodeOptions } from './TextNode';

export interface SceneNodeJson {
  id: string;
  name: string;
  props?: Record<string, unknown>;
  children?: SceneNodeJson[];
}

export interface SceneFileJson {
  version: 1;
  root: SceneNodeJson;
}

type SceneNodeFactory = (definition: SceneNodeJson) => GameNode;

export class SceneNodeFactoryRegistry {
  private readonly factories = new Map<string, SceneNodeFactory>();

  registerImage(guid: string): this {
    this.factories.set(guid, (definition) => new ImageNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as ImageNodeOptions));
    return this;
  }

  registerText(guid: string): this {
    this.factories.set(guid, (definition) => new TextNode({ guid: definition.id, name: definition.name, ...(definition.props ?? {}) } as TextNodeOptions));
    return this;
  }

  createTree(definition: SceneNodeJson): GameNode {
    const factory = this.factories.get(definition.id);
    if (!factory) throw new Error(`No scene node factory registered for '${definition.id}' (${definition.name})`);

    const node = factory(definition);
    for (const child of definition.children ?? []) node.addChild(this.createTree(child));
    return node;
  }
}
