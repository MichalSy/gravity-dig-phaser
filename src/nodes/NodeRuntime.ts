import type Phaser from 'phaser';
import { GameNode, type NodeContext, type RenderContext } from './GameNode';
import { NodeScene } from './NodeScene';

export interface NodeRuntimeOptions {
  phaserScene: Phaser.Scene;
}

class RuntimeRenderContext implements RenderContext {
  readonly sceneIndex: number;
  traversalIndex = 0;
  private readonly base: NodeContext;
  private readonly depthBase: number;
  private readonly depthStep: number;

  constructor(base: NodeContext, sceneIndex: number, depthBase: number, depthStep: number) {
    this.base = base;
    this.sceneIndex = sceneIndex;
    this.depthBase = depthBase;
    this.depthStep = depthStep;
  }

  get phaserScene(): Phaser.Scene {
    return this.base.phaserScene;
  }

  get runtime(): NodeRuntime {
    return this.base.runtime;
  }

  getNode<T extends GameNode = GameNode>(name: string): T | undefined {
    return this.base.getNode<T>(name);
  }

  requireNode<T extends GameNode = GameNode>(name: string): T {
    return this.base.requireNode<T>(name);
  }

  nextDepth(): number {
    const depth = this.depthBase + this.traversalIndex * this.depthStep;
    this.traversalIndex += 1;
    return depth;
  }
}

export class NodeRuntime {
  private readonly rootNodes: GameNode[] = [];
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

  get roots(): readonly GameNode[] {
    return this.rootNodes;
  }

  get scenes(): readonly NodeScene[] {
    return this.nodeScenes;
  }

  addRoot<T extends GameNode>(root: T): T {
    if (root.parent) throw new Error(`Root node '${root.debugName()}' cannot have a parent`);
    if (this.rootNodes.includes(root)) return root;

    this.rootNodes.push(root);
    this.sortRoots();

    if (this.initialized) {
      this.mountSubtree(root, this.ctx);
      if (this.resolved) root.resolveTree(this.ctx);
    }

    return root;
  }

  removeRoot(root: GameNode): void {
    const index = this.rootNodes.indexOf(root);
    if (index < 0) return;

    root.destroyTree();
    this.rootNodes.splice(index, 1);
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

    for (const root of this.sortedRoots()) root.initTree(this.ctx);
    for (const scene of this.sortedScenes()) scene.initTree(this.ctx);
    this.initialized = true;
  }

  resolve(): void {
    this.init();
    if (this.resolved) return;

    for (const root of this.sortedRoots()) root.resolveTree(this.ctx);
    for (const scene of this.sortedScenes()) scene.resolveTree(this.ctx);
    this.resolved = true;
  }

  update(deltaMs: number): void {
    this.resolve();
    for (const root of this.sortedRoots()) root.updateTree(deltaMs);
    for (const scene of this.sortedScenes()) scene.updateTree(deltaMs);
  }

  render(): void {
    this.resolve();
    for (const root of this.sortedRoots()) {
      const renderCtx = new RuntimeRenderContext(this.ctx, -1, -1000, 0.001);
      root.renderTree(renderCtx);
    }

    this.sortedScenes().forEach((scene, sceneIndex) => {
      const renderCtx = new RuntimeRenderContext(this.ctx, sceneIndex, sceneIndex * 1000, 0.001);
      scene.renderTree(renderCtx);
    });
  }

  destroy(): void {
    for (const scene of [...this.nodeScenes].reverse()) scene.destroyTree();
    for (const root of [...this.rootNodes].reverse()) root.destroyTree();
    this.nodeScenes.length = 0;
    this.rootNodes.length = 0;
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

  private sortRoots(): void {
    this.rootNodes.sort((a, b) => a.order - b.order);
  }

  private sortedRoots(): readonly GameNode[] {
    this.sortRoots();
    return this.rootNodes;
  }

  private sortScenes(): void {
    this.nodeScenes.sort((a, b) => a.order - b.order);
  }

  private sortedScenes(): readonly NodeScene[] {
    this.sortScenes();
    return this.nodeScenes;
  }
}
