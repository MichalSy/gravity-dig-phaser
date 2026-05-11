declare module '@gravity-dig/dynamic-node' {
  export abstract class ScriptNode {
    id: string;
    name?: string;
    log(message: string, ...values: unknown[]): void;
    getNode<T = unknown>(key: string): T | undefined;
    requireNode<T = unknown>(key: string): T;
    getNodeById<T = unknown>(instanceId: string): T | undefined;
    requireNodeById<T = unknown>(instanceId: string): T;
    getNodesByName<T = unknown>(name: string): T[];
    getAppVersion(): string;
    emit(action: string): void;
    init?(): void;
    update?(deltaMs: number): void;
    destroy?(): void;
  }

  export interface PropOptions {
    label?: string;
    min?: number;
    max?: number;
    step?: number;
    readOnly?: boolean;
    reason?: string;
  }

  export const prop: {
    string<T extends string>(value: T, options?: PropOptions): T;
    number(value: number, options?: PropOptions): number;
    boolean(value: boolean, options?: PropOptions): boolean;
    assetId<T extends string>(value: T, options?: PropOptions): T;
    nodeRef<T extends string | null>(value?: T, options?: PropOptions): T;
    nodeRefList<T extends string[]>(value?: T, options?: PropOptions): T;
  };
}
