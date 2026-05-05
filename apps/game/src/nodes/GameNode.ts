import type Phaser from 'phaser';
import type { AssetCatalog } from '../assets/AssetCatalog';
import { anchorOffset, type Anchor, type PointLike, type SizeLike } from './Anchor';
import type { NodeRuntime } from './NodeRuntime';

export interface NodeContext {
  phaserScene: Phaser.Scene;
  runtime: NodeRuntime;
  assets: AssetCatalog;
  getNode<T extends GameNode = GameNode>(name: string): T | undefined;
  requireNode<T extends GameNode = GameNode>(name: string): T;
}


export interface NodeDebugBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  scrollFactor?: number;
}

export type NodeDebugProps = Record<string, string | number | boolean | null>;

export interface GameNodeOptions {
  name?: string;
  className?: string;
  active?: boolean;
  visible?: boolean;
  order?: number;
  position?: Partial<PointLike>;
  size?: Partial<SizeLike>;
  anchor?: Anchor;
}

export abstract class GameNode {
  readonly name?: string;
  private readonly debugClassNameValue: string;
  active: boolean;
  visible: boolean;
  order: number;
  position: PointLike;
  size: SizeLike;
  anchor: Anchor;
  parent?: GameNode;
  readonly dependencies: readonly string[] = [];

  private readonly childNodes: GameNode[] = [];
  private nodeContext?: NodeContext;
  private initialized = false;
  private resolved = false;

  protected constructor(options: GameNodeOptions = {}) {
    this.name = options.name;
    this.debugClassNameValue = options.className ?? this.constructor.name;
    this.active = options.active ?? true;
    this.visible = options.visible ?? true;
    this.order = options.order ?? 0;
    this.position = { x: options.position?.x ?? 0, y: options.position?.y ?? 0 };
    this.size = { width: options.size?.width ?? 0, height: options.size?.height ?? 0 };
    this.anchor = options.anchor ?? 'top-left';
  }

  get children(): readonly GameNode[] {
    return this.childNodes;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  get isResolved(): boolean {
    return this.resolved;
  }

  protected get assets(): AssetCatalog {
    if (!this.nodeContext) throw new Error(`Node ${this.debugName()} is not initialized and cannot access assets`);
    return this.nodeContext.assets;
  }

  addChild<T extends GameNode>(child: T): T {
    if (child.parent) throw new Error(`Node ${child.debugName()} already has a parent`);

    child.parent = this;
    this.childNodes.push(child);
    this.sortChildren();

    if (this.nodeContext) {
      this.nodeContext.runtime.mountSubtree(child, this.nodeContext);
    }

    return child;
  }

  removeChild(child: GameNode): void {
    const index = this.childNodes.indexOf(child);
    if (index < 0) return;

    child.destroyTree();
    child.parent = undefined;
    this.childNodes.splice(index, 1);
  }

  init(_ctx: NodeContext): void {}
  resolve(_ctx: NodeContext): void {}
  update(_deltaMs: number): void {}
  destroy(): void {}

  initTree(ctx: NodeContext): void {
    if (this.initialized) return;

    this.nodeContext = ctx;
    ctx.runtime.registerNode(this);
    this.init(ctx);
    this.initialized = true;

    for (const child of this.sortedChildren()) child.initTree(ctx);
  }

  resolveTree(ctx: NodeContext): void {
    if (this.resolved) return;

    this.validateDependencies(ctx);
    this.resolve(ctx);
    this.resolved = true;

    for (const child of this.sortedChildren()) child.resolveTree(ctx);
  }

  updateTree(deltaMs: number): void {
    if (!this.active) return;

    this.update(deltaMs);
    for (const child of this.sortedChildren()) child.updateTree(deltaMs);
  }

  destroyTree(): void {
    for (const child of [...this.childNodes].reverse()) child.destroyTree();
    this.childNodes.length = 0;

    this.destroy();
    this.nodeContext?.runtime.unregisterNode(this);
    this.nodeContext = undefined;
    this.initialized = false;
    this.resolved = false;
  }

  getLocalAnchorOffset(): PointLike {
    return anchorOffset(this.anchor, this.size);
  }

  getLocalOrigin(): PointLike {
    const offset = this.getLocalAnchorOffset();
    return {
      x: this.position.x - offset.x,
      y: this.position.y - offset.y,
    };
  }

  getWorldPosition(): PointLike {
    const parentPosition = this.parent?.getWorldPosition() ?? { x: 0, y: 0 };
    return {
      x: parentPosition.x + this.position.x,
      y: parentPosition.y + this.position.y,
    };
  }

  getWorldOrigin(): PointLike {
    const worldPosition = this.getWorldPosition();
    const offset = this.getLocalAnchorOffset();
    return {
      x: worldPosition.x - offset.x,
      y: worldPosition.y - offset.y,
    };
  }

  getDebugBounds(): NodeDebugBounds | undefined {
    if (this.size.width <= 0 || this.size.height <= 0) return undefined;
    const origin = this.getWorldOrigin();
    return { x: origin.x, y: origin.y, width: this.size.width, height: this.size.height };
  }

  getDebugProps(): NodeDebugProps {
    return {
      active: this.active,
      visible: this.visible,
      order: this.order,
      x: this.position.x,
      y: this.position.y,
      width: this.size.width,
      height: this.size.height,
    };
  }

  getNode<T extends GameNode = GameNode>(name: string): T | undefined {
    return this.nodeContext?.getNode<T>(name);
  }

  requireNode<T extends GameNode = GameNode>(name: string): T {
    if (!this.nodeContext) throw new Error(`Node ${this.debugName()} is not initialized and cannot resolve '${name}'`);
    return this.nodeContext.requireNode<T>(name);
  }

  debugName(): string {
    return this.name ?? this.debugClassNameValue;
  }

  debugClassName(): string {
    return this.debugClassNameValue;
  }

  private validateDependencies(ctx: NodeContext): void {
    for (const dependency of this.dependencies) {
      if (!ctx.getNode(dependency)) {
        throw new Error(`Node ${this.debugName()} depends on missing node '${dependency}'`);
      }
    }
  }

  private sortChildren(): void {
    this.childNodes.sort((a, b) => a.order - b.order);
  }

  private sortedChildren(): readonly GameNode[] {
    this.sortChildren();
    return this.childNodes;
  }
}
