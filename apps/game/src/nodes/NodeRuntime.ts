import type Phaser from 'phaser';
import { AssetCatalog, type ImageAssetDefinition } from '../assets/AssetCatalog';
import { GameNode, type NodeContext } from './GameNode';
import { NodeRoot } from './NodeRoot';

export interface NodeRuntimeOptions {
  phaserScene: Phaser.Scene;
}

export class NodeRuntime {
  private readonly persistentNodeList: GameNode[] = [];
  private readonly rootNodes: NodeRoot[] = [];
  private readonly registry = new Map<string, GameNode>();
  private readonly assetCatalog: AssetCatalog;
  private readonly ctx: NodeContext;
  private initialized = false;
  private resolved = false;

  constructor(options: NodeRuntimeOptions) {
    this.assetCatalog = new AssetCatalog(options.phaserScene);
    this.ctx = {
      phaserScene: options.phaserScene,
      runtime: this,
      assets: this.assetCatalog,
      getNode: <T extends GameNode = GameNode>(name: string): T | undefined => this.getNode<T>(name),
      requireNode: <T extends GameNode = GameNode>(name: string): T => this.requireNode<T>(name),
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

  addPersistentNode<T extends GameNode>(node: T): T {
    if (node.parent) throw new Error(`Persistent node '${node.debugName()}' cannot have a parent`);
    if (this.persistentNodeList.includes(node)) return node;

    this.persistentNodeList.push(node);
    this.sortPersistentNodes();

    if (this.initialized) {
      this.mountSubtree(node, this.ctx);
      if (this.resolved) node.resolveTree(this.ctx);
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
    this.sortRoots();

    if (this.initialized) {
      this.mountSubtree(root, this.ctx);
      if (this.resolved) root.resolveTree(this.ctx);
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

    for (const node of this.sortedPersistentNodes()) node.initTree(this.ctx);
    for (const root of this.sortedRoots()) root.initTree(this.ctx);
    this.initialized = true;
  }

  resolve(): void {
    this.init();
    if (this.resolved) return;

    for (const node of this.sortedPersistentNodes()) node.resolveTree(this.ctx);
    for (const root of this.sortedRoots()) root.resolveTree(this.ctx);
    this.resolved = true;
  }

  update(deltaMs: number): void {
    this.resolve();
    for (const node of this.sortedPersistentNodes()) node.updateTree(deltaMs);
    for (const root of this.sortedRoots()) root.updateTree(deltaMs);
  }

  destroy(): void {
    for (const root of [...this.rootNodes].reverse()) root.destroyTree();
    for (const node of [...this.persistentNodeList].reverse()) node.destroyTree();
    this.rootNodes.length = 0;
    this.persistentNodeList.length = 0;
    this.registry.clear();
    this.initialized = false;
    this.resolved = false;
  }

  getNode<T extends GameNode = GameNode>(name: string): T | undefined {
    return this.registry.get(name) as T | undefined;
  }

  requireNode<T extends GameNode = GameNode>(name: string): T {
    const node = this.getNode<T>(name);
    if (!node) throw new Error(`Required node '${name}' was not found`);
    return node;
  }

  registerNode(node: GameNode): void {
    if (!node.name) return;

    const existing = this.registry.get(node.name);
    if (existing && existing !== node) throw new Error(`Duplicate node name '${node.name}'`);
    this.registry.set(node.name, node);
  }

  unregisterNode(node: GameNode): void {
    if (node.name && this.registry.get(node.name) === node) this.registry.delete(node.name);
  }

  mountSubtree(node: GameNode, ctx = this.ctx): void {
    node.initTree(ctx);
    if (this.resolved) node.resolveTree(ctx);
  }

  private sortPersistentNodes(): void {
    this.persistentNodeList.sort((a, b) => a.order - b.order);
  }

  private sortedPersistentNodes(): readonly GameNode[] {
    this.sortPersistentNodes();
    return this.persistentNodeList;
  }

  private sortRoots(): void {
    this.rootNodes.sort((a, b) => a.order - b.order);
  }

  private sortedRoots(): readonly NodeRoot[] {
    this.sortRoots();
    return this.rootNodes;
  }
}
