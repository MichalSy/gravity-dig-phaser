import type Phaser from 'phaser';
import { AssetCatalog, type FontAssetDefinition, type ImageAssetDefinition } from '../assets/AssetCatalog';
import type { AnimationSetDefinition } from '../assets/animationSetMeta';
import { GameNode, type NodeContext } from './GameNode';
import { NodeRoot } from './NodeRoot';
import { NodeRuntimeMode } from './NodeRuntimeMode';

export interface NodeRuntimeOptions {
  phaserScene: Phaser.Scene;
  mode?: NodeRuntimeMode;
}

export class NodeRuntime {
  private readonly persistentNodeList: GameNode[] = [];
  private readonly rootNodes: NodeRoot[] = [];
  private readonly nodesByInstanceId = new Map<string, GameNode>();
  private readonly nodesByName = new Map<string, Set<GameNode>>();
  private readonly assetCatalog: AssetCatalog;
  private readonly ctx: NodeContext;
  mode: NodeRuntimeMode;
  private initialized = false;
  private resolved = false;

  constructor(options: NodeRuntimeOptions) {
    this.mode = options.mode ?? NodeRuntimeMode.Play;
    this.assetCatalog = new AssetCatalog(options.phaserScene);
    this.ctx = {
      phaserScene: options.phaserScene,
      runtime: this,
      assets: this.assetCatalog,
      getNode: <T extends GameNode = GameNode>(key: string): T | undefined => this.getNode<T>(key),
      requireNode: <T extends GameNode = GameNode>(key: string): T => this.requireNode<T>(key),
      getNodeById: <T extends GameNode = GameNode>(instanceId: string): T | undefined => this.getNodeById<T>(instanceId),
      requireNodeById: <T extends GameNode = GameNode>(instanceId: string): T => this.requireNodeById<T>(instanceId),
      getNodesByName: <T extends GameNode = GameNode>(name: string): T[] => this.getNodesByName<T>(name),
    };
  }

  get persistentNodes(): readonly GameNode[] {
    return this.persistentNodeList;
  }

  get roots(): readonly NodeRoot[] {
    return this.rootNodes;
  }

  get assets(): AssetCatalog {
    return this.assetCatalog;
  }

  registerImageAssets(definitions: readonly ImageAssetDefinition[]): void {
    this.assetCatalog.registerImages(definitions);
  }

  registerAnimationSets(definitions: readonly AnimationSetDefinition[]): void {
    this.assetCatalog.registerAnimationSets(definitions);
  }

  registerFontAssets(definitions: readonly FontAssetDefinition[]): void {
    this.assetCatalog.registerFonts(definitions);
  }

  addPersistentNode<T extends GameNode>(node: T): T {
    if (node.parent) throw new Error(`Persistent node '${node.debugName()}' cannot have a parent`);
    if (this.persistentNodeList.includes(node)) return node;

    this.persistentNodeList.push(node);

    if (this.initialized) {
      this.mountSubtree(node, this.ctx);
    }

    return node;
  }

  removePersistentNode(node: GameNode): void {
    const index = this.persistentNodeList.indexOf(node);
    if (index < 0) return;

    node.destroyTree();
    this.persistentNodeList.splice(index, 1);
  }

  addRoot<T extends NodeRoot>(root: T): T {
    if (root.parent) throw new Error(`NodeRoot '${root.debugName()}' cannot have a parent`);
    if (this.rootNodes.includes(root)) return root;

    this.rootNodes.push(root);

    if (this.initialized) {
      this.mountSubtree(root, this.ctx);
    }

    return root;
  }

  removeRoot(root: NodeRoot): void {
    const index = this.rootNodes.indexOf(root);
    if (index < 0) return;

    root.destroyTree();
    this.rootNodes.splice(index, 1);
  }

  init(): void {
    if (this.initialized) return;

    for (const node of this.persistentNodeList) node.initTree(this.ctx);
    for (const root of this.rootNodes) root.initTree(this.ctx);
    this.initialized = true;
  }

  resolve(): void {
    this.init();
    if (this.resolved) return;

    for (const node of this.persistentNodeList) node.resolveTree(this.ctx);
    for (const root of this.rootNodes) root.resolveTree(this.ctx);
    this.resolved = true;
    for (const node of this.persistentNodeList) node.afterResolvedTree(this.ctx);
    for (const root of this.rootNodes) root.afterResolvedTree(this.ctx);
  }

  update(deltaMs: number): void {
    this.resolve();
    for (const node of this.persistentNodeList) node.measureTree(deltaMs);
    for (const root of this.rootNodes) root.measureTree(deltaMs);
    for (const node of this.persistentNodeList) node.arrangeTree();
    for (const root of this.rootNodes) root.arrangeTree();
    if (this.mode === NodeRuntimeMode.Editor) {
      for (const node of this.persistentNodeList) node.editorUpdateTree(deltaMs);
      for (const root of this.rootNodes) root.editorUpdateTree(deltaMs);
    } else {
      for (const node of this.persistentNodeList) node.updateTree(deltaMs);
      for (const root of this.rootNodes) root.updateTree(deltaMs);
    }
    this.applySceneObjectHierarchy();
  }

  destroy(): void {
    for (const root of [...this.rootNodes].reverse()) root.destroyTree();
    for (const node of [...this.persistentNodeList].reverse()) node.destroyTree();
    this.rootNodes.length = 0;
    this.persistentNodeList.length = 0;
    this.nodesByInstanceId.clear();
    this.nodesByName.clear();
    this.initialized = false;
    this.resolved = false;
  }

  getNodeById<T extends GameNode = GameNode>(instanceId: string): T | undefined {
    return this.nodesByInstanceId.get(instanceId) as T | undefined;
  }

  requireNodeById<T extends GameNode = GameNode>(instanceId: string): T {
    const node = this.getNodeById<T>(instanceId);
    if (!node) throw new Error(`Required node id '${instanceId}' was not found`);
    return node;
  }

  getNodesByName<T extends GameNode = GameNode>(name: string): T[] {
    return [...(this.nodesByName.get(name) ?? [])] as T[];
  }

  getNode<T extends GameNode = GameNode>(key: string): T | undefined {
    return this.getNodeById<T>(key) ?? this.getNodesByName<T>(key)[0];
  }

  requireNode<T extends GameNode = GameNode>(key: string): T {
    const node = this.getNode<T>(key);
    if (!node) throw new Error(`Required node '${key}' was not found`);
    return node;
  }

  registerNode(node: GameNode): void {
    const existing = this.nodesByInstanceId.get(node.instanceId);
    if (existing && existing !== node) throw new Error(`Duplicate node instanceId '${node.instanceId}'`);
    this.nodesByInstanceId.set(node.instanceId, node);

    if (!node.name) return;
    const namedNodes = this.nodesByName.get(node.name) ?? new Set<GameNode>();
    namedNodes.add(node);
    this.nodesByName.set(node.name, namedNodes);
  }

  unregisterNode(node: GameNode): void {
    if (this.nodesByInstanceId.get(node.instanceId) === node) this.nodesByInstanceId.delete(node.instanceId);
    if (!node.name) return;
    const namedNodes = this.nodesByName.get(node.name);
    if (!namedNodes) return;
    namedNodes.delete(node);
    if (namedNodes.size === 0) this.nodesByName.delete(node.name);
  }

  mountSubtree(node: GameNode, ctx = this.ctx): void {
    node.initTree(ctx);
    if (!this.resolved) return;

    node.resolveTree(ctx);
    node.afterResolvedTree(ctx);
  }

  private applySceneObjectHierarchy(): void {
    const orderedObjects = [
      ...this.rootNodes.flatMap((root) => root.getSceneObjectsInHierarchy()),
      ...this.persistentNodeList.flatMap((node) => node.getSceneObjectsInHierarchy()),
    ];
    for (const object of orderedObjects) this.ctx.phaserScene.children.bringToTop(object);
  }
}
