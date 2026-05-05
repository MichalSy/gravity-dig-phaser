import type Phaser from 'phaser';
import type { DebugNodeBounds, DebugNodePoint, DebugNodeTransform } from '@gravity-dig/debug-protocol';
import type { AssetCatalog } from '../assets/AssetCatalog';
import { anchorOffset, anchorOrigin, type Anchor, type PointLike, type SizeLike } from './Anchor';
import type { NodeRuntime } from './NodeRuntime';

function rotatePoint(x: number, y: number, rotation: number, offset: PointLike): PointLike {
  if (rotation === 0) return { x: offset.x + x, y: offset.y + y };
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return { x: offset.x + x * cos - y * sin, y: offset.y + x * sin + y * cos };
}

export interface NodeContext {
  phaserScene: Phaser.Scene;
  runtime: NodeRuntime;
  assets: AssetCatalog;
  getNode<T extends GameNode = GameNode>(name: string): T | undefined;
  requireNode<T extends GameNode = GameNode>(name: string): T;
}


export type NodeDebugBounds = DebugNodeBounds;

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
  origin?: Partial<PointLike>;
  rotation?: number;
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
  origin: PointLike;
  rotation: number;
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
    const defaultOrigin = anchorOrigin(this.anchor);
    this.origin = { x: options.origin?.x ?? defaultOrigin.x, y: options.origin?.y ?? defaultOrigin.y };
    this.rotation = options.rotation ?? 0;
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

  getLocalOriginOffset(): PointLike {
    return { x: this.origin.x * this.size.width, y: this.origin.y * this.size.height };
  }

  getLocalOrigin(): PointLike {
    const offset = this.getLocalOriginOffset();
    return {
      x: this.position.x - offset.x,
      y: this.position.y - offset.y,
    };
  }

  getLocalScale(): PointLike {
    return { x: 1, y: 1 };
  }

  getParentWorldScale(): PointLike {
    return this.parent?.getWorldScale() ?? { x: 1, y: 1 };
  }

  getWorldScale(): PointLike {
    const parentScale = this.getParentWorldScale();
    const localScale = this.getLocalScale();
    return { x: parentScale.x * localScale.x, y: parentScale.y * localScale.y };
  }

  getWorldRotation(): number {
    return (this.parent?.getWorldRotation() ?? 0) + this.rotation;
  }

  getWorldPosition(): PointLike {
    const parent = this.parent;
    if (!parent) return { ...this.position };

    const parentPosition = parent.getWorldPosition();
    const parentScale = parent.getWorldScale();
    const parentRotation = parent.getWorldRotation();
    return rotatePoint(this.position.x * parentScale.x, this.position.y * parentScale.y, parentRotation, parentPosition);
  }

  worldToLocalPosition(worldPosition: PointLike): PointLike {
    const parent = this.parent;
    if (!parent) return { ...worldPosition };

    const parentPosition = parent.getWorldPosition();
    const parentScale = parent.getWorldScale();
    const parentRotation = -parent.getWorldRotation();
    const dx = worldPosition.x - parentPosition.x;
    const dy = worldPosition.y - parentPosition.y;
    const unrotated = rotatePoint(dx, dy, parentRotation, { x: 0, y: 0 });
    return { x: unrotated.x / parentScale.x, y: unrotated.y / parentScale.y };
  }

  getWorldOrigin(): PointLike {
    const worldPosition = this.getWorldPosition();
    const offset = this.getLocalOriginOffset();
    const parentScale = this.getParentWorldScale();
    return rotatePoint(-offset.x * parentScale.x, -offset.y * parentScale.y, this.getWorldRotation(), worldPosition);
  }

  getLocalTransform(): DebugNodeTransform {
    const localScale = this.getLocalScale();
    return {
      x: this.position.x,
      y: this.position.y,
      width: this.size.width,
      height: this.size.height,
      originX: this.origin.x,
      originY: this.origin.y,
      rotation: this.rotation,
      scaleX: localScale.x,
      scaleY: localScale.y,
    };
  }

  getWorldTransform(): DebugNodeTransform {
    const worldPosition = this.getWorldPosition();
    const parentScale = this.getParentWorldScale();
    const worldScale = this.getWorldScale();
    return {
      x: worldPosition.x,
      y: worldPosition.y,
      width: this.size.width * parentScale.x,
      height: this.size.height * parentScale.y,
      originX: this.origin.x,
      originY: this.origin.y,
      rotation: this.getWorldRotation(),
      scaleX: worldScale.x,
      scaleY: worldScale.y,
    };
  }

  getWorldBounds(): NodeDebugBounds | undefined {
    if (this.size.width <= 0 || this.size.height <= 0) return undefined;

    const worldPosition = this.getWorldPosition();
    const parentScale = this.getParentWorldScale();
    const rotation = this.getWorldRotation();
    const left = -this.origin.x * this.size.width * parentScale.x;
    const top = -this.origin.y * this.size.height * parentScale.y;
    const right = left + this.size.width * parentScale.x;
    const bottom = top + this.size.height * parentScale.y;
    const corners: [DebugNodePoint, DebugNodePoint, DebugNodePoint, DebugNodePoint] = [
      rotatePoint(left, top, rotation, worldPosition),
      rotatePoint(right, top, rotation, worldPosition),
      rotatePoint(right, bottom, rotation, worldPosition),
      rotatePoint(left, bottom, rotation, worldPosition),
    ];
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY, corners };
  }

  getDebugBounds(): NodeDebugBounds | undefined {
    return this.getWorldBounds();
  }

  getDebugProps(): NodeDebugProps {
    const world = this.getWorldTransform();
    return {
      active: this.active,
      visible: this.visible,
      order: this.order,
      localX: this.position.x,
      localY: this.position.y,
      localWidth: this.size.width,
      localHeight: this.size.height,
      originX: this.origin.x,
      originY: this.origin.y,
      rotation: this.rotation,
      worldX: world.x,
      worldY: world.y,
      worldRotation: world.rotation,
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
