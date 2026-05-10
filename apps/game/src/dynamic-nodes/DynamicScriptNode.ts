import type { DebugSceneNodeDefinition, DebugScenePropDefinition, DebugScenePropGroup, DebugScenePropValue } from '@gravity-dig/debug-protocol';
import { GameNode, type GameNodeOptions, type NodeContext, type NodeDebugProps } from '../nodes/GameNode';
import { validateScenePropValue, type ScenePatchResult } from '../nodes/SceneProps';

export interface DynamicPropMarker {
  __dynamicNodeProp: true;
  value: DebugScenePropValue;
  definition: DebugScenePropDefinition;
}

export interface DynamicScriptBehavior {
  id?: string;
  name?: string;
  init?(ctx: DynamicScriptContext): void;
  update?(deltaMs: number): void;
  destroy?(): void;
  [key: string]: unknown;
}

export interface DynamicScriptContext {
  log(message: string, ...values: unknown[]): void;
  getNode(key: string): GameNode | undefined;
  requireNode(key: string): GameNode;
  getNodeById(instanceId: string): GameNode | undefined;
  requireNodeById(instanceId: string): GameNode;
  getNodesByName(name: string): GameNode[];
  getAppVersion(): string;
  emit(action: string): void;
}

export interface DynamicNodeModule {
  nodeTypeId: string;
  displayName?: string;
  createBehavior(): DynamicScriptBehavior;
}

export interface DynamicScriptNodeOptions extends GameNodeOptions {
  module: DynamicNodeModule;
  props?: Record<string, unknown>;
  actions?: Record<string, () => void>;
}

export class DynamicScriptNode extends GameNode {
  static override readonly sceneType = 'DynamicScriptNode';

  private module: DynamicNodeModule;
  private behavior: DynamicScriptBehavior;
  private scriptPropDefinitions: Record<string, DebugScenePropDefinition>;
  private scriptContext?: DynamicScriptContext;
  private readonly scriptPropOverrides = new Set<string>();
  private readonly actions: Record<string, () => void>;

  constructor(options: DynamicScriptNodeOptions) {
    super({ ...options, nodeTypeId: options.nodeTypeId ?? options.module.nodeTypeId, className: options.module.displayName ?? 'DynamicScriptNode' });
    this.module = options.module;
    this.behavior = this.module.createBehavior();
    this.actions = options.actions ?? {};
    const extracted = extractScriptProps(this.behavior);
    this.scriptPropDefinitions = extracted.definitions;
    for (const [key, value] of Object.entries(options.props ?? {})) {
      if (key in this.scriptPropDefinitions) this.behavior[key] = value;
    }
  }

  override init(ctx: NodeContext): void {
    const scriptContext = this.createScriptContext(ctx);
    this.scriptContext = scriptContext;
    (this.behavior as DynamicScriptBehavior & { __dynamicNodeContext?: DynamicScriptContext }).__dynamicNodeContext = scriptContext;
    this.behavior.init?.(scriptContext);
  }

  override update(deltaMs: number): void {
    this.behavior.update?.(deltaMs);
  }

  override destroy(): void {
    this.behavior.destroy?.();
    delete (this.behavior as DynamicScriptBehavior & { __dynamicNodeContext?: DynamicScriptContext }).__dynamicNodeContext;
    this.scriptContext = undefined;
  }

  reloadModule(module: DynamicNodeModule): void {
    const previousValues = Object.fromEntries(Object.keys(this.scriptPropDefinitions).map((key) => [key, this.behavior[key]]));
    this.behavior.destroy?.();
    delete (this.behavior as DynamicScriptBehavior & { __dynamicNodeContext?: DynamicScriptContext }).__dynamicNodeContext;

    this.module = module;
    this.behavior = this.module.createBehavior();
    const extracted = extractScriptProps(this.behavior);
    this.scriptPropDefinitions = extracted.definitions;
    for (const [key, value] of Object.entries(previousValues)) {
      if (key in this.scriptPropDefinitions) this.behavior[key] = value;
    }
    if (this.scriptContext) {
      (this.behavior as DynamicScriptBehavior & { __dynamicNodeContext?: DynamicScriptContext }).__dynamicNodeContext = this.scriptContext;
      this.behavior.init?.(this.scriptContext);
    }
  }

  override getSceneDefinition(id = this.instanceId): DebugSceneNodeDefinition | undefined {
    return {
      instanceId: id,
      name: this.debugName(),
      typeName: this.module.displayName ?? 'Dynamic Script',
      exposedPropGroups: this.getDynamicExposedPropGroups(),
      overlayLayers: [],
    };
  }

  override applySceneProps(props: Record<string, unknown>): ScenePatchResult {
    const result: ScenePatchResult = { applied: {}, rejected: {} };
    const baseProps: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(props)) {
      const definition = this.scriptPropDefinitions[key];
      if (!definition) {
        baseProps[key] = value;
        continue;
      }

      const validatedValue = validateScenePropValue(definition, value);
      if (validatedValue === undefined) {
        result.rejected[key] = 'Ungültiger Wert für Script-Prop-Typ.';
        continue;
      }

      this.behavior[key] = validatedValue;
      if (validatedValue === null) this.scriptPropOverrides.delete(key);
      else this.scriptPropOverrides.add(key);
      result.applied[key] = validatedValue;
    }

    const baseResult = Object.keys(baseProps).length > 0 ? super.applySceneProps(baseProps) : undefined;
    return {
      applied: { ...(baseResult?.applied ?? {}), ...result.applied },
      rejected: { ...(baseResult?.rejected ?? {}), ...result.rejected },
    };
  }

  override hasScenePropOverride(key: string): boolean {
    return this.scriptPropOverrides.has(key) || super.hasScenePropOverride(key);
  }

  override getDebugProps(): NodeDebugProps {
    return {
      ...super.getDebugProps(),
      script: this.module.nodeTypeId,
      ...Object.fromEntries(Object.keys(this.scriptPropDefinitions).map((key) => [key, debugValue(this.behavior[key])])),
    };
  }

  private getDynamicExposedPropGroups(): DebugScenePropGroup[] {
    return [
      ...GameNode.exposedPropGroups,
      { name: 'Script', props: this.scriptPropDefinitions },
    ];
  }

  private createScriptContext(ctx: NodeContext): DynamicScriptContext {
    return {
      log: (message, ...values) => console.info(`[DynamicNode:${this.debugName()}] ${message}`, ...values),
      getNode: (key) => ctx.getNode(key),
      requireNode: (key) => ctx.requireNode(key),
      getNodeById: (instanceId) => ctx.getNodeById(instanceId),
      requireNodeById: (instanceId) => ctx.requireNodeById(instanceId),
      getNodesByName: (name) => ctx.getNodesByName(name),
      getAppVersion: () => __APP_VERSION__,
      emit: (action) => this.emitScriptAction(action),
    };
  }

  private emitScriptAction(action: string): void {
    const handler = this.actions[action];
    if (!handler) {
      console.warn(`[DynamicNode:${this.debugName()}] unknown script action '${action}'`);
      return;
    }
    handler();
  }
}

function extractScriptProps(behavior: DynamicScriptBehavior): { definitions: Record<string, DebugScenePropDefinition> } {
  const definitions: Record<string, DebugScenePropDefinition> = {};
  for (const [key, value] of Object.entries(behavior)) {
    if (!isDynamicPropMarker(value)) continue;
    definitions[key] = value.definition;
    behavior[key] = value.value;
  }
  return { definitions };
}

function isDynamicPropMarker(value: unknown): value is DynamicPropMarker {
  return typeof value === 'object' && value !== null && (value as DynamicPropMarker).__dynamicNodeProp === true;
}

function debugValue(value: unknown): NodeDebugProps[string] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return value === undefined ? null : JSON.stringify(value);
}
