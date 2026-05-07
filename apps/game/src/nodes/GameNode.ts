import type Phaser from 'phaser';
import type { DebugNodeBounds, DebugNodePatch, DebugNodePoint, DebugNodeTransform, DebugSceneNodeDefinition } from '@gravity-dig/debug-protocol';
import type { AssetCatalog } from '../assets/AssetCatalog';
import { anchorOffset, type Anchor, type PointLike, type SizeLike } from './Anchor';
import type { NodeRuntime } from './NodeRuntime';
import { NODE_TYPE_IDS } from './NodeTypeIds';
import { exposedPropGroup, flattenExposedPropGroups, propBoolean, type ExposedPropGroup, type ScenePatchResult, validateScenePropValue } from './SceneProps';

function rotatePoint(x: number, y: number, rotation: number, offset: PointLike): PointLike {
  if (rotation === 0) return { x: offset.x + x, y: offset.y + y };
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return { x: offset.x + x * cos - y * sin, y: offset.y + x * sin + y * cos };
}

function isPointPatchValue(value: DebugNodePatch[string]): value is PointLike {
  return typeof value === 'object' && value !== null && 'x' in value && 'y' in value;
}

function isSizePatchValue(value: DebugNodePatch[string]): value is SizeLike {
  return typeof value === 'object' && value !== null && 'width' in value && 'height' in value;
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

export type NodeSizeMode = 'explicit' | 'content';
export type NodeBoundsMode = 'content' | 'none';

export interface GameNodeOptions {
  nodeTypeId?: string;
  instanceId?: string;
  name?: string;
  className?: string;
  active?: boolean;
  visible?: boolean;
  position?: Partial<PointLike>;
  size?: Partial<SizeLike>;
  parentAnchor?: Anchor;
  origin?: Partial<PointLike>;
  rotation?: number;
  sizeMode?: NodeSizeMode;
  boundsMode?: NodeBoundsMode;
  debugScrollFactor?: number;
}

export abstract class GameNode {
  static debugLayoutEnabled = false;
  static readonly nodeTypeId: string = NODE_TYPE_IDS.GameNode;
  static readonly sceneType: string = 'GameNode';
  static readonly exposedPropGroups: readonly ExposedPropGroup[] = [
    exposedPropGroup('State', {
      active: propBoolean({ label: 'Active' }),
    }),
  ];

  readonly nodeTypeId: string;
  readonly instanceId: string;
  readonly name?: string;
  private readonly debugClassNameValue: string;
  active: boolean;
  position: PointLike;
  size: SizeLike;
  parentAnchor: Anchor;
  origin: PointLike;
  rotation: number;
  sizeMode: NodeSizeMode;
  boundsMode: NodeBoundsMode;
  debugScrollFactor?: number;
  parent?: GameNode;
  readonly dependencies: readonly string[] = [];

  private readonly childNodes: GameNode[] = [];
  private readonly scenePropOverrides = new Set<string>();
  private readonly readOnlyExposedProps = new Map<string, string | undefined>();
  private contentBounds?: NodeDebugBounds;
  private nodeContext?: NodeContext;
  private initialized = false;
  private resolved = false;

  protected constructor(options: GameNodeOptions = {}) {
    this.nodeTypeId = options.nodeTypeId ?? getNodeTypeId(this);
    this.instanceId = options.instanceId ?? crypto.randomUUID();
    this.name = options.name;
    this.debugClassNameValue = options.className ?? this.constructor.name;
    this.active = options.active ?? true;
    this.position = { x: options.position?.x ?? 0, y: options.position?.y ?? 0 };
    this.size = { width: options.size?.width ?? 0, height: options.size?.height ?? 0 };
    this.parentAnchor = options.parentAnchor ?? 'top-left';
    this.origin = { x: options.origin?.x ?? 0, y: options.origin?.y ?? 0 };
    this.rotation = options.rotation ?? 0;
    this.sizeMode = options.sizeMode ?? (options.size ? 'explicit' : 'content');
    this.boundsMode = options.boundsMode ?? 'content';
    this.debugScrollFactor = options.debugScrollFactor;
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
  afterResolved(_ctx: NodeContext): void {}
  update(_deltaMs: number): void {}
  afterChildrenUpdated(): void {}
  destroy(): void {}

  initTree(ctx: NodeContext): void {
    if (this.initialized) return;

    this.nodeContext = ctx;
    ctx.runtime.registerNode(this);
    this.init(ctx);
    this.initialized = true;

    for (const child of this.children) child.initTree(ctx);
  }

  resolveTree(ctx: NodeContext): void {
    if (this.resolved) return;

    this.validateDependencies(ctx);
    this.resolve(ctx);
    this.resolved = true;

    for (const child of this.children) child.resolveTree(ctx);
  }

  afterResolvedTree(ctx: NodeContext): void {
    if (!this.resolved) return;

    this.afterResolved(ctx);
    for (const child of this.children) child.afterResolvedTree(ctx);
  }

  updateTree(deltaMs: number): void {
    if (!this.isEffectivelyActive()) return;

    this.update(deltaMs);
    for (const child of this.children) child.updateTree(deltaMs);
    this.updateContentSizeFromChildren();
    this.afterChildrenUpdated();
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

  getParentAnchorOffset(): PointLike {
    if (!this.parent) return { x: 0, y: 0 };
    const parentAnchorOffset = anchorOffset(this.parentAnchor, this.parent.size);
    const parentOriginOffset = this.parent.getLocalOriginOffset();
    return { x: parentAnchorOffset.x - parentOriginOffset.x, y: parentAnchorOffset.y - parentOriginOffset.y };
  }

  getPositionInParent(): PointLike {
    const parentAnchorOffset = this.getParentAnchorOffset();
    return { x: parentAnchorOffset.x + this.position.x, y: parentAnchorOffset.y + this.position.y };
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

  isEffectivelyActive(): boolean {
    let node: GameNode | undefined = this;
    while (node) {
      if (!node.active) return false;
      node = node.parent;
    }
    return true;
  }

  protected refreshSubtreeActiveState(): void {
    this.onEffectiveActiveChanged(this.isEffectivelyActive());
    for (const child of this.children) child.refreshSubtreeActiveState();
  }

  protected onEffectiveActiveChanged(_active: boolean): void {}

  isDebugVisible(): boolean {
    return true;
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

  getBoundsInParentSpace(): NodeDebugBounds | undefined {
    if (this.boundsMode === 'none') return undefined;
    const localBounds = this.getLocalContentBounds();
    if (!localBounds) return undefined;

    const localScale = this.getLocalScale();
    const left = localBounds.x * localScale.x;
    const top = localBounds.y * localScale.y;
    const right = (localBounds.x + localBounds.width) * localScale.x;
    const bottom = (localBounds.y + localBounds.height) * localScale.y;
    const corners = [
      rotatePoint(left, top, this.rotation, this.getPositionInParent()),
      rotatePoint(right, top, this.rotation, this.getPositionInParent()),
      rotatePoint(right, bottom, this.rotation, this.getPositionInParent()),
      rotatePoint(left, bottom, this.rotation, this.getPositionInParent()),
    ];
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY, scrollFactor: localBounds.scrollFactor ?? this.debugScrollFactor };
  }

  updateContentSizeFromChildren(): void {
    if (this.sizeMode !== 'content' || this.children.length === 0) return;

    const includeHidden = GameNode.debugLayoutEnabled;
    const childBounds = this.children
      .filter((child) => includeHidden || child.isDebugVisible())
      .map((child) => child.getBoundsInParentSpace())
      .filter((bounds): bounds is NodeDebugBounds => Boolean(bounds));
    if (childBounds.length === 0) return;

    const minX = Math.min(0, ...childBounds.map((bounds) => bounds.x));
    const minY = Math.min(0, ...childBounds.map((bounds) => bounds.y));
    const maxX = Math.max(0, ...childBounds.map((bounds) => bounds.x + bounds.width));
    const maxY = Math.max(0, ...childBounds.map((bounds) => bounds.y + bounds.height));
    const scrollFactors = childBounds.map((bounds) => bounds.scrollFactor).filter((value): value is number => value !== undefined);
    const scrollFactor = scrollFactors.length > 0 && scrollFactors.every((value) => value === scrollFactors[0]) ? scrollFactors[0] : undefined;
    this.contentBounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY, scrollFactor };
    this.size = { width: maxX - minX, height: maxY - minY };
  }

  getWorldPosition(): PointLike {
    const parent = this.parent;
    if (!parent) return { ...this.position };

    const parentPosition = parent.getWorldPosition();
    const parentScale = parent.getWorldScale();
    const parentRotation = parent.getWorldRotation();
    const positionInParent = this.getPositionInParent();
    return rotatePoint(positionInParent.x * parentScale.x, positionInParent.y * parentScale.y, parentRotation, parentPosition);
  }

  getWorldParentAnchorPosition(): PointLike | undefined {
    const parent = this.parent;
    if (!parent) return undefined;

    const parentPosition = parent.getWorldPosition();
    const parentScale = parent.getWorldScale();
    const parentRotation = parent.getWorldRotation();
    const childParentAnchorOffset = this.getParentAnchorOffset();
    return rotatePoint(childParentAnchorOffset.x * parentScale.x, childParentAnchorOffset.y * parentScale.y, parentRotation, parentPosition);
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
    const positionInParent = { x: unrotated.x / parentScale.x, y: unrotated.y / parentScale.y };
    const parentAnchorOffset = this.getParentAnchorOffset();
    return { x: positionInParent.x - parentAnchorOffset.x, y: positionInParent.y - parentAnchorOffset.y };
  }

  getWorldOrigin(): PointLike {
    return this.getWorldPosition();
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
    if (this.boundsMode === 'none') return undefined;
    const localBounds = this.getLocalContentBounds();
    if (!localBounds) return undefined;

    const worldPosition = this.getWorldPosition();
    const parentScale = this.getParentWorldScale();
    const localScale = this.getLocalScale();
    const rotation = this.getWorldRotation();
    const scaleX = parentScale.x * localScale.x;
    const scaleY = parentScale.y * localScale.y;
    const left = localBounds.x * scaleX;
    const top = localBounds.y * scaleY;
    const right = (localBounds.x + localBounds.width) * scaleX;
    const bottom = (localBounds.y + localBounds.height) * scaleY;
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
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY, scrollFactor: localBounds.scrollFactor ?? this.debugScrollFactor, corners };
  }

  getDebugBounds(): NodeDebugBounds | undefined {
    return this.getWorldBounds();
  }

  getSceneDefinition(id = this.instanceId): DebugSceneNodeDefinition | undefined {
    if (!id) return undefined;
    const constructor = this.constructor as typeof GameNode;
    return {
      instanceId: id,
      name: this.debugName(),
      typeName: constructor.sceneType,
      exposedPropGroups: this.getExposedPropGroups(),
      editableProps: this.getFlattenedExposedProps(),
    };
  }

  applySceneProps(props: Record<string, unknown>): ScenePatchResult {
    const exposedProps = this.getFlattenedExposedProps();
    const result: ScenePatchResult = { applied: {}, rejected: {} };

    for (const [key, value] of Object.entries(props)) {
      const definition = exposedProps[key];
      if (!definition) {
        result.rejected[key] = 'Prop ist für diesen Node nicht exposed.';
        continue;
      }

      const validatedValue = validateScenePropValue(definition, value);
      if (validatedValue === undefined) {
        result.rejected[key] = 'Ungültiger Wert für Prop-Typ.';
        continue;
      }

      if (!this.applySceneProp(key, validatedValue)) {
        result.rejected[key] = 'Prop konnte nicht angewendet werden.';
        continue;
      }

      this.scenePropOverrides.add(key);
      result.applied[key] = validatedValue;
    }

    return result;
  }

  hasScenePropOverride(key: string): boolean {
    return this.scenePropOverrides.has(key);
  }

  markExposedPropReadOnly(key: string, reason?: string): void {
    this.readOnlyExposedProps.set(key, reason);
  }

  private getExposedPropGroups() {
    const constructor = this.constructor as typeof GameNode;
    if (this.readOnlyExposedProps.size === 0) return [...constructor.exposedPropGroups];
    return constructor.exposedPropGroups.map((group) => ({
      ...group,
      props: Object.fromEntries(Object.entries(group.props).map(([key, prop]) => [
        key,
        this.readOnlyExposedProps.has(key) ? { ...prop, readOnly: true, reason: this.readOnlyExposedProps.get(key) } : prop,
      ])),
    }));
  }

  private getFlattenedExposedProps() {
    return flattenExposedPropGroups(this.getExposedPropGroups());
  }

  protected applySceneProp(key: string, value: DebugNodePatch[string]): boolean {
    switch (key) {
      case 'active':
        if (typeof value !== 'boolean') return false;
        if (this.active === value) return true;
        this.active = value;
        this.refreshSubtreeActiveState();
        return true;
      case 'position':
        if (!isPointPatchValue(value)) return false;
        this.position = value;
        return true;
      case 'size':
        if (!isSizePatchValue(value)) return false;
        this.size = value;
        this.sizeMode = 'explicit';
        return true;
      case 'parentAnchor':
        if (typeof value !== 'string') return false;
        this.parentAnchor = value as Anchor;
        return true;
      case 'origin':
        if (!isPointPatchValue(value)) return false;
        this.origin = value;
        return true;
      case 'rotation':
        if (typeof value !== 'number') return false;
        this.rotation = value;
        return true;
      default:
        return false;
    }
  }

  getDebugProps(): NodeDebugProps {
    return {
      active: this.active,
      scenePropOverrides: this.scenePropOverrides.size > 0 ? [...this.scenePropOverrides].join(',') : null,
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

  getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    return this.childNodes.flatMap((child) => child.getSceneObjectsInHierarchy());
  }

  protected getLocalContentBounds(): NodeDebugBounds | undefined {
    if (this.contentBounds && this.contentBounds.width > 0 && this.contentBounds.height > 0) return this.contentBounds;
    if (this.size.width <= 0 || this.size.height <= 0) return undefined;
    return {
      x: -this.origin.x * this.size.width,
      y: -this.origin.y * this.size.height,
      width: this.size.width,
      height: this.size.height,
      scrollFactor: this.debugScrollFactor,
    };
  }
}

function getNodeTypeId(node: GameNode): string {
  return ((node.constructor as typeof GameNode).nodeTypeId) ?? NODE_TYPE_IDS.GameNode;
}
