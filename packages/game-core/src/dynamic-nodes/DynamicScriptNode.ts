import type { DebugSceneNodeDefinition, DebugScenePropDefinition, DebugScenePropGroup } from '@gravity-dig/debug-protocol';
import { GameNode, type GameNodeOptions, type NodeContext, type NodeDebugProps } from '../nodes/GameNode';
import { validateScenePropValue, type ScenePatchResult } from '../nodes/SceneProps';
import type { DynamicPropMarker } from './DynamicNodeApi';

export interface DynamicScriptBehavior {
  id?: string;
  name?: string;
  init?(ctx: DynamicScriptContext): void;
  resolve?(ctx: DynamicScriptContext): void;
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
  getRuntimeMode(): 'editor' | 'play';
  emit(action: string): void;
}

export interface DynamicNodeModule {
  nodeTypeId: string;
  displayName?: string;
  createBehavior(): DynamicScriptBehavior;
}

interface ScriptFault {
  phase: string;
  message: string;
}

const guardedFunction = Symbol('dynamic-script-guarded-function');

export interface DynamicScriptNodeOptions extends GameNodeOptions {
  module: DynamicNodeModule;
  props?: Record<string, unknown>;
  actions?: Record<string, (source: DynamicScriptNode) => void>;
}

export class DynamicScriptNode extends GameNode {
  static override readonly sceneType = 'DynamicScriptNode';

  private module: DynamicNodeModule;
  private behavior: DynamicScriptBehavior;
  private scriptPropDefinitions: Record<string, DebugScenePropDefinition>;
  private scriptContext?: DynamicScriptContext;
  private scriptFault?: ScriptFault;
  private scriptErrorCount = 0;
  private readonly scriptPropOverrides = new Set<string>();
  private readonly actions: Record<string, (source: DynamicScriptNode) => void>;

  constructor(options: DynamicScriptNodeOptions) {
    super({ ...options, nodeTypeId: options.nodeTypeId ?? options.module.nodeTypeId, className: options.module.displayName ?? 'DynamicScriptNode' });
    this.module = options.module;
    this.behavior = this.createGuardedBehavior();
    this.actions = options.actions ?? {};
    const extracted = this.extractScriptPropsSafely(this.behavior);
    this.scriptPropDefinitions = extracted.definitions;
    for (const [key, value] of Object.entries(options.props ?? {})) {
      if (key in this.scriptPropDefinitions) this.behavior[key] = value;
    }
  }

  override init(ctx: NodeContext): void {
    const scriptContext = this.createScriptContext(ctx);
    this.scriptContext = scriptContext;
    (this.behavior as DynamicScriptBehavior & { __dynamicNodeContext?: DynamicScriptContext }).__dynamicNodeContext = scriptContext;
    this.callScriptLifecycle('init', () => this.behavior.init?.(scriptContext));
  }

  override resolve(_ctx: NodeContext): void {
    const scriptContext = this.scriptContext;
    if (this.scriptFault || !scriptContext) return;
    this.callScriptLifecycle('resolve', () => this.behavior.resolve?.(scriptContext));
  }

  override update(deltaMs: number): void {
    if (this.scriptFault) return;
    this.callScriptLifecycle('update', () => this.behavior.update?.(deltaMs));
  }

  override destroy(): void {
    this.callScriptLifecycle('destroy', () => this.behavior.destroy?.());
    delete (this.behavior as DynamicScriptBehavior & { __dynamicNodeContext?: DynamicScriptContext }).__dynamicNodeContext;
    this.scriptContext = undefined;
  }

  callScriptMethod(name: string, ...args: unknown[]): unknown {
    const method = this.behavior[name];
    if (typeof method !== 'function') return undefined;
    return this.callScriptLifecycle(`method:${name}`, () => (method as (...args: unknown[]) => unknown).apply(this.behavior, args));
  }

  getScriptProperty(name: string): unknown {
    return this.readScriptValue(name);
  }

  reloadModule(module: DynamicNodeModule): void {
    const previousValues = Object.fromEntries(Object.keys(this.scriptPropDefinitions).map((key) => [key, this.readScriptValue(key)]));
    this.callScriptLifecycle('destroy', () => this.behavior.destroy?.());
    delete (this.behavior as DynamicScriptBehavior & { __dynamicNodeContext?: DynamicScriptContext }).__dynamicNodeContext;

    this.module = module;
    this.scriptFault = undefined;
    this.behavior = this.createGuardedBehavior();
    const extracted = this.extractScriptPropsSafely(this.behavior);
    this.scriptPropDefinitions = extracted.definitions;
    for (const [key, value] of Object.entries(previousValues)) {
      if (key in this.scriptPropDefinitions) this.behavior[key] = value;
    }
    const scriptContext = this.scriptContext;
    if (scriptContext) {
      (this.behavior as DynamicScriptBehavior & { __dynamicNodeContext?: DynamicScriptContext }).__dynamicNodeContext = scriptContext;
      this.callScriptLifecycle('init', () => this.behavior.init?.(scriptContext));
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

      try {
        this.behavior[key] = validatedValue;
        if (validatedValue === null) this.scriptPropOverrides.delete(key);
        else this.scriptPropOverrides.add(key);
        result.applied[key] = validatedValue;
      } catch (error) {
        this.recordScriptError(`set-prop:${key}`, error);
        result.rejected[key] = `Script-Prop konnte nicht gesetzt werden: ${errorMessage(error)}`;
      }
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
      scriptStatus: this.scriptFault ? 'faulted' : 'ok',
      scriptError: this.scriptFault ? `${this.scriptFault.phase}: ${this.scriptFault.message}` : null,
      scriptErrorCount: this.scriptErrorCount,
      ...Object.fromEntries(Object.keys(this.scriptPropDefinitions).map((key) => [key, this.readDebugScriptValue(key)])),
    };
  }

  private getDynamicExposedPropGroups(): DebugScenePropGroup[] {
    return [
      ...GameNode.exposedPropGroups,
      { name: 'Script', props: this.scriptPropDefinitions },
    ];
  }

  private extractScriptPropsSafely(behavior: DynamicScriptBehavior): { definitions: Record<string, DebugScenePropDefinition> } {
    try {
      return extractScriptProps(behavior);
    } catch (error) {
      this.recordScriptError('extract-props', error);
      return { definitions: {} };
    }
  }

  private readScriptValue(key: string): unknown {
    try {
      return this.behavior[key];
    } catch (error) {
      this.recordScriptError(`get-prop:${key}`, error);
      return undefined;
    }
  }

  private readDebugScriptValue(key: string): NodeDebugProps[string] {
    try {
      return debugValue(this.behavior[key]);
    } catch (error) {
      return `<error: ${errorMessage(error)}>`;
    }
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
      getRuntimeMode: () => ctx.runtime.mode,
      emit: (action) => this.callScriptLifecycle(`emit:${action}`, () => this.emitScriptAction(action)),
    };
  }

  private createGuardedBehavior(): DynamicScriptBehavior {
    try {
      return this.installExceptionGuards(this.module.createBehavior());
    } catch (error) {
      this.recordScriptError('create', error);
      return {};
    }
  }

  private installExceptionGuards(behavior: DynamicScriptBehavior): DynamicScriptBehavior {
    const wrap = (fn: (...args: unknown[]) => unknown, phase: string) => {
      if ((fn as { [guardedFunction]?: true })[guardedFunction]) return fn;
      const node = this;
      const wrapped = function guardedScriptFunction(this: unknown, ...args: unknown[]) {
        try {
          const result = fn.apply(this, args);
          if (isPromiseLike(result)) {
            void result.catch((error: unknown) => node.recordScriptError(phase, error));
          }
          return result;
        } catch (error) {
          node.recordScriptError(phase, error);
          return undefined;
        }
      };
      Object.defineProperty(wrapped, guardedFunction, { value: true });
      return wrapped;
    };

    for (const [key, value] of Object.entries(behavior)) {
      if (typeof value === 'function') behavior[key] = wrap(value as (...args: unknown[]) => unknown, key);
    }

    let prototype = Object.getPrototypeOf(behavior) as object | null;
    while (prototype && prototype !== Object.prototype) {
      if ((prototype.constructor as { name?: string } | undefined)?.name === 'ScriptNode') break;
      for (const key of Object.getOwnPropertyNames(prototype)) {
        if (key === 'constructor' || Object.hasOwn(behavior, key)) continue;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
        if (typeof descriptor?.value !== 'function') continue;
        Object.defineProperty(behavior, key, {
          configurable: true,
          writable: true,
          value: wrap(descriptor.value as (...args: unknown[]) => unknown, key),
        });
      }
      prototype = Object.getPrototypeOf(prototype) as object | null;
    }

    return behavior;
  }

  private callScriptLifecycle(phase: string, callback: () => unknown): unknown {
    try {
      const result = callback();
      if (isPromiseLike(result)) {
        void result.catch((error: unknown) => this.recordScriptError(phase, error));
      }
      return result;
    } catch (error) {
      this.recordScriptError(phase, error);
      return undefined;
    }
  }

  private recordScriptError(phase: string, error: unknown): void {
    const message = errorMessage(error);
    this.scriptFault = { phase, message };
    this.scriptErrorCount += 1;
    console.error(`[DynamicNode:${this.debugName()}] Script exception in ${phase}: ${message}`, error);
  }

  private emitScriptAction(action: string): void {
    const handler = this.actions[action];
    if (!handler) {
      console.warn(`[DynamicNode:${this.debugName()}] unknown script action '${action}'`);
      return;
    }
    handler(this);
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

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as Promise<unknown>).catch === 'function';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function debugValue(value: unknown): NodeDebugProps[string] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) return value;
  return value === undefined ? null : JSON.stringify(value);
}
