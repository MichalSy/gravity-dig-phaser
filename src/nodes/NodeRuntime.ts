import type Phaser from 'phaser';
import { GameNode, type NodeContext } from './GameNode';
import { NodeScene } from './NodeScene';

export interface NodeRuntimeOptions {
  phaserScene: Phaser.Scene;
}

export class NodeRuntime {
  private readonly persistentNodeList: GameNode[] = [];
  private readonly nodeScenes: NodeScene[] = [];
  private readonly registry = new Map<string, GameNode>();
  private readonly ctx: NodeContext;
  private initialized = false;
  private resolved = false;

  constructor(options: NodeRuntimeOptions) {
    this.ctx = {
      phaserScene: options.phaserScene,
      runtime: this,
      getNode: <T extends GameNode = GameNode>(name: string): T | undefined => this.getNode<T>(name),
      requireNode: <T extends GameNode = GameNode>(name: string): T => this.requireNode<T>(name),
    };
  }

  get persistentNodes(): readonly GameNode[] {
    return this.persistentNodeList;
  }

  get scenes(): readonly NodeScene[] {
    return this.nodeScenes;
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

  addScene<T extends NodeScene>(scene: T): T {
    if (scene.parent) throw new Error(`NodeScene '${scene.debugName()}' cannot have a parent`);
    if (this.nodeScenes.includes(scene)) return scene;

    this.nodeScenes.push(scene);
    this.sortScenes();

    if (this.initialized) {
      this.mountSubtree(scene, this.ctx);
      if (this.resolved) scene.resolveTree(this.ctx);
    }

    return scene;
  }

  removeScene(scene: NodeScene): void {
    const index = this.nodeScenes.indexOf(scene);
    if (index < 0) return;

    scene.destroyTree();
    this.nodeScenes.splice(index, 1);
  }

  init(): void {
    if (this.initialized) return;

    for (const node of this.sortedPersistentNodes()) node.initTree(this.ctx);
    for (const scene of this.sortedScenes()) scene.initTree(this.ctx);
    this.initialized = true;
  }

  resolve(): void {
    this.init();
    if (this.resolved) return;

    for (const node of this.sortedPersistentNodes()) node.resolveTree(this.ctx);
    for (const scene of this.sortedScenes()) scene.resolveTree(this.ctx);
    this.resolved = true;
  }

  update(deltaMs: number): void {
    this.resolve();
    for (const node of this.sortedPersistentNodes()) node.updateTree(deltaMs);
    for (const scene of this.sortedScenes()) scene.updateTree(deltaMs);
  }

  destroy(): void {
    for (const scene of [...this.nodeScenes].reverse()) scene.destroyTree();
    for (const node of [...this.persistentNodeList].reverse()) node.destroyTree();
    this.nodeScenes.length = 0;
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

  private sortScenes(): void {
    this.nodeScenes.sort((a, b) => a.order - b.order);
  }

  private sortedScenes(): readonly NodeScene[] {
    this.sortScenes();
    return this.nodeScenes;
  }
}
