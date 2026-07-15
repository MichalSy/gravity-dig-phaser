import {
  AnimatedImageNode,
  AudioNode,
  ButtonNode,
  CollisionRectNode,
  createDynamicScriptNode,
  DynamicScriptNode,
  getDefinitionNodeTypeId,
  ImageNode,
  LineNode,
  PrefabManager,
  RectangleNode,
  SceneNode,
  SceneNodeFactoryRegistry,
  TextNode,
  TransformNode,
  type DynamicNodeModule,
  type EditorPreviewSetPropsChange,
  type SceneNodeJson,
} from '@gravity-dig/game-core';
import { InputDeviceNode } from '../app/nodes';
import { GameRootNode, GameWorldNode, LevelNode, LootLayerNode, VisibilityFieldNode } from '../game/nodes';
import { InputModeDetectorNode, TouchControlsNode, UIRootNode } from '../ui/nodes';
import { NODE_TYPE_IDS } from './NodeTypeIds';

export interface GravityDigNodeFactoryBindings {
  prefabManager: PrefabManager;
  previewChanges?: readonly EditorPreviewSetPropsChange[];
  dynamicModules?: Iterable<DynamicNodeModule>;
  createScriptActions(): Record<string, (source: DynamicScriptNode) => void>;
  onDynamicScriptNode?(node: DynamicScriptNode): void;
}

export function createGravityDigNodeFactory(bindings: GravityDigNodeFactoryBindings): SceneNodeFactoryRegistry {
  const factory: SceneNodeFactoryRegistry = new SceneNodeFactoryRegistry();
  factory
    .withPreviewChanges(bindings.previewChanges)
    .withPrefabManager(bindings.prefabManager)
    .register(NODE_TYPE_IDS.TransformNode, (definition) => new TransformNode(optionsFrom(definition)))
    .register(NODE_TYPE_IDS.SceneNode, (definition) => new SceneNode({ nodeTypeId: getDefinitionNodeTypeId(definition), instanceId: definition.instanceId, rootName: definition.name ?? 'Scene', ...(definition.props ?? {}) }))
    .register(NODE_TYPE_IDS.ButtonNode, (definition) => new ButtonNode(optionsFrom(definition)))
    .register(NODE_TYPE_IDS.InputDeviceNode, (definition) => new InputDeviceNode(optionsFrom(definition)))
    .register(NODE_TYPE_IDS.LevelNode, (definition) => new LevelNode(optionsFrom(definition)))
    .register(NODE_TYPE_IDS.LootLayerNode, (definition) => new LootLayerNode(optionsFrom(definition)))
    .register(NODE_TYPE_IDS.VisibilityFieldNode, (definition) => new VisibilityFieldNode(optionsFrom(definition)))
    .register(NODE_TYPE_IDS.GameWorldNode, (definition) => new GameWorldNode({
      ...optionsFrom(definition),
      instantiatePrefab: (prefabId) => factory.createPrefab(prefabId, {}, { origin: 'runtime-code', createdByInstanceId: definition.instanceId }),
    }))
    .register(NODE_TYPE_IDS.InputModeDetectorNode, (definition) => new InputModeDetectorNode(optionsFrom(definition)))
    .register(NODE_TYPE_IDS.GameRootNode, (definition) => new GameRootNode(optionsFrom(definition)))
    .register(NODE_TYPE_IDS.UIRootNode, (definition) => new UIRootNode(optionsFrom(definition)))
    .register(NODE_TYPE_IDS.TouchControlsNode, (definition) => new TouchControlsNode(optionsFrom(definition)))
    .register(NODE_TYPE_IDS.ImageNode, (definition) => new ImageNode(optionsFrom(definition) as unknown as ConstructorParameters<typeof ImageNode>[0]))
    .register(NODE_TYPE_IDS.TextNode, (definition) => new TextNode(optionsFrom(definition)))
    .register(NODE_TYPE_IDS.AnimatedImageNode, (definition) => new AnimatedImageNode(optionsFrom(definition) as unknown as ConstructorParameters<typeof AnimatedImageNode>[0]))
    .register(NODE_TYPE_IDS.CollisionRectNode, (definition) => new CollisionRectNode(optionsFrom(definition)))
    .register(NODE_TYPE_IDS.LineNode, (definition) => new LineNode(optionsFrom(definition)))
    .register(NODE_TYPE_IDS.RectangleNode, (definition) => new RectangleNode(optionsFrom(definition)))
    .register(NODE_TYPE_IDS.AudioNode, (definition) => new AudioNode(optionsFrom(definition)));

  for (const module of bindings.dynamicModules ?? []) registerGravityDigDynamicModule(factory, module, bindings);
  return factory;
}

export function registerGravityDigDynamicModule(
  factory: SceneNodeFactoryRegistry,
  module: DynamicNodeModule,
  bindings: Pick<GravityDigNodeFactoryBindings, 'createScriptActions' | 'onDynamicScriptNode'>,
): void {
  factory.register(module.nodeTypeId, (definition) => {
    const node = createDynamicScriptNode({
      module,
      nodeTypeId: getDefinitionNodeTypeId(definition),
      instanceId: definition.instanceId,
      name: definition.name,
      props: definition.props,
      actions: bindings.createScriptActions(),
      instantiatePrefab: (prefabId, options) => factory.createPrefab(prefabId, options, { origin: 'runtime-script', createdByInstanceId: definition.instanceId }),
    });
    bindings.onDynamicScriptNode?.(node);
    return node;
  });
}

function optionsFrom(definition: SceneNodeJson): Record<string, unknown> {
  return { nodeTypeId: getDefinitionNodeTypeId(definition), instanceId: definition.instanceId, name: definition.name, ...(definition.props ?? {}) };
}
