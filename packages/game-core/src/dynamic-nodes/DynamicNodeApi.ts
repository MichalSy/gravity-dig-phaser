import type { DebugScenePropDefinition, DebugScenePropValue } from '@gravity-dig/debug-protocol';
import type { GameNode } from '../nodes/GameNode';
import type { DynamicScriptContext } from './DynamicScriptNode';

export interface DynamicPropMarker {
  __dynamicNodeProp: true;
  value: DebugScenePropValue;
  definition: DebugScenePropDefinition;
}

export interface PropOptions {
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  readOnly?: boolean;
  reason?: string;
}

export abstract class ScriptNode {
  id!: string;
  name?: string;
  private __dynamicNodeContext?: DynamicScriptContext;

  log(message: string, ...values: unknown[]): void {
    this.__dynamicNodeContext?.log(message, ...values);
  }

  getNode<T = GameNode>(key: string): T | undefined {
    return this.__dynamicNodeContext?.getNode(key) as T | undefined;
  }

  requireNode<T = GameNode>(key: string): T {
    const node = this.__dynamicNodeContext?.requireNode(key) as T | undefined;
    if (!node) throw new Error('Dynamic node context is not initialized');
    return node;
  }

  getNodeById<T = GameNode>(instanceId: string): T | undefined {
    return this.__dynamicNodeContext?.getNodeById(instanceId) as T | undefined;
  }

  requireNodeById<T = GameNode>(instanceId: string): T {
    const node = this.__dynamicNodeContext?.requireNodeById(instanceId) as T | undefined;
    if (!node) throw new Error('Dynamic node context is not initialized');
    return node;
  }

  getNodesByName<T = GameNode>(name: string): T[] {
    return (this.__dynamicNodeContext?.getNodesByName(name) ?? []) as T[];
  }

  getAppVersion(): string {
    return this.__dynamicNodeContext?.getAppVersion() ?? '0.0.0';
  }

  getRuntimeMode(): 'editor' | 'play' {
    return this.__dynamicNodeContext?.getRuntimeMode() ?? 'play';
  }

  getViewportSize(): { width: number; height: number } {
    return this.__dynamicNodeContext?.getViewportSize() ?? { width: 1280, height: 720 };
  }

  instantiatePrefab<T = GameNode>(path: string, options?: { name?: string; props?: Record<string, unknown> }): T {
    const node = this.__dynamicNodeContext?.instantiatePrefab(path, options);
    if (!node) throw new Error('Dynamic node context is not initialized');
    return node as T;
  }

  emit(action: string): void {
    this.__dynamicNodeContext?.emit(action);
  }

  init?(): void;
  resolve?(): void;
  update?(deltaMs: number): void;
  destroy?(): void;
}

function marker(value: DebugScenePropValue, definition: DebugScenePropDefinition): DynamicPropMarker {
  return { __dynamicNodeProp: true, value, definition };
}

export const prop = {
  string<T extends string>(value: T, options: PropOptions = {}): T {
    return marker(value, { type: 'String', ...options }) as unknown as T;
  },
  number(value: number, options: PropOptions = {}): number {
    return marker(value, { type: 'Number', ...options }) as unknown as number;
  },
  boolean(value: boolean, options: PropOptions = {}): boolean {
    return marker(value, { type: 'Boolean', ...options }) as unknown as boolean;
  },
  assetId<T extends string>(value: T, options: PropOptions = {}): T {
    return marker(value, { type: 'AssetId', ...options }) as unknown as T;
  },
  color<T extends string>(value: T, options: PropOptions = {}): T {
    return marker(value, { type: 'Color', ...options }) as unknown as T;
  },
  nodeRef<T extends string | null>(value: T = null as T, options: PropOptions = {}): T {
    return marker(value, { type: 'NodeRef', ...options }) as unknown as T;
  },
  nodeRefList<T extends string[]>(value: T = [] as unknown as T, options: PropOptions = {}): T {
    return marker(value, { type: 'NodeRefList', ...options }) as unknown as T;
  },
};
