import Phaser from 'phaser';
import type { DebugDynamicNodeModuleResponseMessage, DebugMessage, DebugNodeCreateMessage, DebugNodeDeleteMessage, DebugNodeMoveMessage, DebugNodePatchMessage, DebugDynamicNodeModuleReference } from '@gravity-dig/debug-protocol';
import { GameNode, SCENE_PROP_RECORDS, type NodeContext, type SceneNodeJson } from '../nodes';
import type { DebugConnectionConfig } from './debugConfig';
import { captureDebugNodeTree, diffDebugNodeTrees, type DebugNodeTreeSnapshot } from './debugNodeTree';

export interface DebugBridgeLiveAuthoring {
  createNode(definition: SceneNodeJson): GameNode;
  hasDynamicModule(module: DebugDynamicNodeModuleReference): boolean;
  ensureDynamicModule(module: DebugDynamicNodeModuleReference, code?: string): Promise<boolean>;
  reloadDynamicModule(module: DebugDynamicNodeModuleReference, code: string): Promise<number>;
}

interface PendingDynamicNodeCreate {
  message: DebugNodeCreateMessage;
  requestedAt: number;
}

interface PendingDynamicNodeUpdate {
  requestId: string;
  module: DebugDynamicNodeModuleReference;
  requestedAt: number;
}

export class DebugBridgeNode extends GameNode {
  private readonly config: DebugConnectionConfig;
  private readonly liveAuthoring?: DebugBridgeLiveAuthoring;
  private socket?: WebSocket;
  private reconnectTimer?: number;
  private reconnectAttempts = 0;
  private ctx?: NodeContext;
  private lastTree?: DebugNodeTreeSnapshot;
  private treeCheckElapsedMs = 0;
  private assetCheckElapsedMs = 0;
  private lastAssetSignature = '';
  private readonly nodeIds = new WeakMap<GameNode, string>();
  private readonly nodesById = new Map<string, GameNode>();
  private readonly nodesByInstanceId = new Map<string, GameNode>();
  private nextNodeId = 1;
  private selectedNodeId?: string;
  private selectedOverlayLayerIds?: Set<string>;
  private propsElapsedMs = 0;
  private lastSelectedPropsSignature = '';
  private overlay?: Phaser.GameObjects.Graphics;
  private readonly clientId = crypto.randomUUID();
  private boundEditorClientId?: string;
  private readonly pendingCreates = new Map<string, PendingDynamicNodeCreate>();
  private readonly pendingUpdates = new Map<string, PendingDynamicNodeUpdate>();

  constructor(config: DebugConnectionConfig, liveAuthoring?: DebugBridgeLiveAuthoring) {
    super({ name: 'DebugBridge', className: 'DebugBridgeNode' });
    this.config = config;
    this.liveAuthoring = liveAuthoring;
  }

  init(ctx: NodeContext): void {
    GameNode.debugLayoutEnabled = true;
    this.ctx = ctx;
    this.overlay = ctx.phaserScene.add.graphics().setVisible(false);
    ctx.phaserScene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.afterSceneUpdate, this);
    this.connect();
  }

  override getSceneObjectsInHierarchy(): Phaser.GameObjects.GameObject[] {
    return this.overlay ? [this.overlay] : [];
  }

  update(deltaMs: number): void {
    this.propsElapsedMs += deltaMs;

    this.assetCheckElapsedMs += deltaMs;
    if (this.assetCheckElapsedMs >= 500) {
      this.assetCheckElapsedMs = 0;
      this.sendAssetListIfChanged();
    }

    this.treeCheckElapsedMs += deltaMs;
    if (this.treeCheckElapsedMs < 250) return;

    this.treeCheckElapsedMs = 0;
    this.sendTreeDeltas();
  }

  destroy(): void {
    GameNode.debugLayoutEnabled = false;
    this.clearReconnectTimer();
    this.ctx?.phaserScene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.afterSceneUpdate, this);
    this.overlay?.destroy();
    this.overlay = undefined;
    this.socket?.close();
    this.socket = undefined;
    this.ctx = undefined;
    this.lastTree = undefined;
    this.lastAssetSignature = '';
    this.selectedNodeId = undefined;
    this.selectedOverlayLayerIds = undefined;
    this.lastSelectedPropsSignature = '';
    this.boundEditorClientId = undefined;
    this.pendingCreates.clear();
    this.pendingUpdates.clear();
    this.nodesById.clear();
    this.nodesByInstanceId.clear();
  }

  private afterSceneUpdate(): void {
    this.drawSelectedNodeOverlay();
    if (this.propsElapsedMs < 100) return;

    this.propsElapsedMs = 0;
    this.sendSelectedNodeProps();
  }

  private connect(): void {
    this.clearReconnectTimer();
    const socket = new WebSocket(this.config.relayUrl);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.send({ type: 'hello', role: 'game', sessionId: this.config.sessionId, clientId: this.clientId });
      this.sendAssetList();
      this.sendNodeDefinitions();
      this.sendTreeSnapshot();
      console.info('[Gravity Dig Debug] connected', this.config);
    });

    socket.addEventListener('message', (event) => {
      const message = this.parseMessage(event.data);
      if (!message || !('sessionId' in message) || message.sessionId !== this.config.sessionId) return;
      if (this.shouldLogDebugMessage(message.type)) console.log('[Gravity Dig Debug][editor->game]', message.type, message);
      if (message.type === 'relay:status' && message.editors > 0) {
        this.sendAssetList();
        this.sendNodeDefinitions();
        this.sendTreeSnapshot();
        this.sendSelectedNodeProps();
      }
      if (message.type === 'bridge:bind-request') this.handleBindRequest(message);
      if (!this.acceptsEditorMessage(message)) return;
      if (message.type === 'node:select') {
        this.selectedNodeId = message.nodeId;
        this.selectedOverlayLayerIds = undefined;
        this.lastSelectedPropsSignature = '';
        this.sendSelectedNodeProps(true);
      }
      if (message.type === 'node:patch') this.applyNodePatch(message);
      if (message.type === 'node:create') void this.applyNodeCreate(message);
      if (message.type === 'node:delete') this.applyNodeDelete(message);
      if (message.type === 'node:move') this.applyNodeMove(message);
      if (message.type === 'dynamic-node:updated') this.requestDynamicNodeUpdate(message);
      if (message.type === 'dynamic-node:module-response') void this.handleDynamicModuleResponse(message);
      if (message.type === 'dynamic-node:module-error') this.rejectPendingDynamicModuleRequest(message.requestId, message.error);
      if (message.type === 'debug:overlay-settings') {
        this.selectedOverlayLayerIds = message.enabledLayerIds ? new Set(message.enabledLayerIds) : undefined;
      }
    });

    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      if (this.socket !== socket) return;
      console.warn('[Gravity Dig Debug] WebSocket error');
    });
  }

  private send(message: DebugMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      if (this.shouldLogDebugMessage(message.type)) console.log('[Gravity Dig Debug][game->editor]', message.type, message);
      this.socket.send(JSON.stringify(message));
    }
  }

  private shouldLogDebugMessage(type: DebugMessage['type']): boolean {
    return type !== 'node:select' && type !== 'node:props' && type !== 'node:patch' && type !== 'node:patch:ack';
  }

  private handleBindRequest(message: Extract<DebugMessage, { type: 'bridge:bind-request' }>): void {
    if (this.boundEditorClientId && this.boundEditorClientId !== message.editorClientId && !message.force) {
      this.send({
        type: 'bridge:bind-rejected',
        sessionId: this.config.sessionId,
        sourceClientId: this.clientId,
        targetClientId: message.editorClientId,
        editorClientId: message.editorClientId,
        gameClientId: this.clientId,
        reason: `Game ist bereits an Editor ${this.boundEditorClientId} gebunden.`,
        sentAt: Date.now(),
      });
      return;
    }

    this.boundEditorClientId = message.editorClientId;
    this.send({
      type: 'bridge:bind-ack',
      sessionId: this.config.sessionId,
      sourceClientId: this.clientId,
      targetClientId: message.editorClientId,
      editorClientId: message.editorClientId,
      gameClientId: this.clientId,
      sentAt: Date.now(),
    });
    this.sendAssetList();
    this.sendNodeDefinitions();
    this.sendTreeSnapshot();
    this.sendSelectedNodeProps(true);
  }

  private acceptsEditorMessage(message: DebugMessage): boolean {
    if (message.type === 'relay:status' || message.type === 'hello' || message.type === 'ping' || message.type === 'pong') return true;
    if (!('sourceClientId' in message) || typeof message.sourceClientId !== 'string') return !this.boundEditorClientId;
    return !this.boundEditorClientId || message.sourceClientId === this.boundEditorClientId;
  }

  private sendAssetList(): void {
    if (!this.ctx) return;
    const images = this.ctx.assets.listDebugImages();
    const animations = this.ctx.assets.listDebugAnimations();
    this.lastAssetSignature = this.createAssetSignature(images, animations);
    this.send({
      type: 'asset:list',
      sessionId: this.config.sessionId,
      images,
      animations,
      sentAt: Date.now(),
    });
  }

  private sendAssetListIfChanged(): void {
    if (!this.ctx || this.socket?.readyState !== WebSocket.OPEN) return;
    const images = this.ctx.assets.listDebugImages();
    const animations = this.ctx.assets.listDebugAnimations();
    const signature = this.createAssetSignature(images, animations);
    if (signature === this.lastAssetSignature) return;
    this.lastAssetSignature = signature;
    this.send({ type: 'asset:list', sessionId: this.config.sessionId, images, animations, sentAt: Date.now() });
  }

  private createAssetSignature(images: { id: string }[], animations: { id: string }[]): string {
    return `${images.length}:${animations.length}:${images.at(-1)?.id ?? ''}:${animations.at(-1)?.id ?? ''}`;
  }

  private sendNodeDefinitions(): void {
    if (!this.ctx) return;
    const nodes = [...this.ctx.runtime.persistentNodes, ...this.ctx.runtime.roots]
      .flatMap((node) => this.collectNodeDefinitions(node))
      .filter((definition) => definition !== undefined);
    this.send({ type: 'node:definitions', sessionId: this.config.sessionId, records: SCENE_PROP_RECORDS, nodes, sentAt: Date.now() });
  }

  private collectNodeDefinitions(node: GameNode): NonNullable<ReturnType<GameNode['getSceneDefinition']>>[] {
    const nodeId = this.getStableNodeId(node);
    const definition = node.getSceneDefinition(node.instanceId ?? nodeId);
    return [definition, ...node.children.flatMap((child) => this.collectNodeDefinitions(child))].filter((item) => item !== undefined);
  }

  private sendTreeSnapshot(): void {
    if (!this.ctx) return;

    const snapshot = captureDebugNodeTree(this.ctx.runtime, (node) => this.getStableNodeId(node), this);
    this.lastTree = snapshot;
    this.sendNodeDefinitions();
    this.send({ type: 'node:tree', sessionId: this.config.sessionId, roots: snapshot.roots, sentAt: Date.now() });
  }

  private sendTreeDeltas(): void {
    if (!this.ctx || this.socket?.readyState !== WebSocket.OPEN) return;

    const nextTree = captureDebugNodeTree(this.ctx.runtime, (node) => this.getStableNodeId(node), this);
    if (!this.lastTree) {
      this.lastTree = nextTree;
      this.send({ type: 'node:tree', sessionId: this.config.sessionId, roots: nextTree.roots, sentAt: Date.now() });
      return;
    }

    const deltas = diffDebugNodeTrees(this.lastTree, nextTree);
    this.lastTree = nextTree;
    if (deltas.length > 0) {
      this.sendNodeDefinitions();
      this.send({ type: 'node:delta', sessionId: this.config.sessionId, deltas, sentAt: Date.now() });
    }
  }

  private getStableNodeId(node: GameNode): string {
    if (node.instanceId) {
      this.nodesById.set(node.instanceId, node);
      this.nodesByInstanceId.set(node.instanceId, node);
      return node.instanceId;
    }

    const existing = this.nodeIds.get(node);
    if (existing) {
      this.nodesById.set(existing, node);
      return existing;
    }

    const id = `node-${this.nextNodeId.toString(36)}`;
    this.nextNodeId += 1;
    this.nodeIds.set(node, id);
    this.nodesById.set(id, node);
    return id;
  }

  private async applyNodeCreate(message: DebugNodeCreateMessage): Promise<void> {
    if (!this.liveAuthoring) {
      this.sendNodeCreateAck(message, false, 'Live Authoring ist im Game nicht konfiguriert.');
      return;
    }

    if (message.module && !this.liveAuthoring.hasDynamicModule(message.module)) {
      if (!this.boundEditorClientId) {
        this.sendNodeCreateAck(message, false, 'Kein gebundener Editor für Dynamic-Node-Modul-Request.');
        return;
      }
      this.pendingCreates.set(message.requestId, { message, requestedAt: Date.now() });
      this.send({
        type: 'dynamic-node:module-request',
        sessionId: this.config.sessionId,
        sourceClientId: this.clientId,
        targetClientId: this.boundEditorClientId,
        requestId: message.requestId,
        module: message.module,
        sentAt: Date.now(),
      });
      return;
    }

    await this.createInjectedNode(message);
  }

  private async handleDynamicModuleResponse(message: DebugDynamicNodeModuleResponseMessage): Promise<void> {
    const pendingCreate = this.pendingCreates.get(message.requestId);
    if (pendingCreate) {
      const ready = await this.liveAuthoring?.ensureDynamicModule(message.module, message.code);
      if (!ready) {
        this.rejectPendingCreate(message.requestId, 'Dynamic-Node-Modul konnte nicht geladen werden.');
        return;
      }
      this.pendingCreates.delete(message.requestId);
      await this.createInjectedNode(pendingCreate.message);
      return;
    }

    const pendingUpdate = this.pendingUpdates.get(message.requestId);
    if (!pendingUpdate) return;
    try {
      const reloaded = await this.liveAuthoring?.reloadDynamicModule(message.module, message.code) ?? 0;
      this.pendingUpdates.delete(message.requestId);
      this.sendDynamicNodeUpdateAck(pendingUpdate, true, reloaded);
      this.sendNodeDefinitions();
      this.sendTreeSnapshot();
      this.sendSelectedNodeProps(true);
    } catch (error) {
      this.pendingUpdates.delete(message.requestId);
      this.sendDynamicNodeUpdateAck(pendingUpdate, false, 0, error instanceof Error ? error.message : String(error));
    }
  }

  private async createInjectedNode(message: DebugNodeCreateMessage): Promise<void> {
    if (!this.liveAuthoring) return;
    const parent = this.nodesById.get(message.parentNodeId) ?? this.nodesByInstanceId.get(message.parentNodeId);
    if (!parent) {
      this.sendNodeCreateAck(message, false, 'Parent Node nicht gefunden.');
      return;
    }

    try {
      await this.ensureDebugImageSources(message.definition);
      const node = this.liveAuthoring.createNode(message.definition as SceneNodeJson);
      parent.addChild(node);
      const nodeId = this.getStableNodeId(node);
      this.sendNodeDefinitions();
      this.sendTreeSnapshot();
      this.sendNodeCreateAck(message, true, undefined, node, nodeId);
    } catch (error) {
      this.sendNodeCreateAck(message, false, error instanceof Error ? error.message : String(error));
    }
  }

  private async ensureDebugImageSources(definition: DebugNodeCreateMessage['definition']): Promise<void> {
    const source = debugImageSourceFromProps(definition.props);
    if (source) {
      if (!this.ctx) throw new Error('NodeContext fehlt für Debug-Image-Lazy-Load.');
      await this.ctx.assets.ensureDebugImageAsset(source);
    }
    for (const child of definition.children ?? []) {
      if (isDebugNodeCreateDefinition(child)) await this.ensureDebugImageSources(child);
    }
  }

  private requestDynamicNodeUpdate(message: Extract<DebugMessage, { type: 'dynamic-node:updated' }>): void {
    if (!this.liveAuthoring || !this.boundEditorClientId) {
      this.sendDynamicNodeUpdateAck({ requestId: message.requestId, module: message.module, requestedAt: Date.now() }, false, 0, 'Live Authoring oder gebundener Editor fehlt.');
      return;
    }
    this.pendingUpdates.set(message.requestId, { requestId: message.requestId, module: message.module, requestedAt: Date.now() });
    this.send({
      type: 'dynamic-node:module-request',
      sessionId: this.config.sessionId,
      sourceClientId: this.clientId,
      targetClientId: this.boundEditorClientId,
      requestId: message.requestId,
      module: message.module,
      sentAt: Date.now(),
    });
  }

  private sendDynamicNodeUpdateAck(pending: PendingDynamicNodeUpdate, applied: boolean, reloaded: number, rejected?: string): void {
    this.send({
      type: 'dynamic-node:update:ack',
      sessionId: this.config.sessionId,
      sourceClientId: this.clientId,
      targetClientId: this.boundEditorClientId,
      requestId: pending.requestId,
      module: pending.module,
      applied,
      reloaded,
      rejected,
      sentAt: Date.now(),
    });
  }

  private rejectPendingCreate(requestId: string, reason: string): void {
    const pending = this.pendingCreates.get(requestId);
    if (!pending) return;
    this.pendingCreates.delete(requestId);
    this.sendNodeCreateAck(pending.message, false, reason);
  }

  private rejectPendingDynamicModuleRequest(requestId: string, reason: string): void {
    if (this.pendingCreates.has(requestId)) this.rejectPendingCreate(requestId, reason);
    const pendingUpdate = this.pendingUpdates.get(requestId);
    if (!pendingUpdate) return;
    this.pendingUpdates.delete(requestId);
    this.sendDynamicNodeUpdateAck(pendingUpdate, false, 0, reason);
  }

  private sendNodeCreateAck(message: DebugNodeCreateMessage, applied: boolean, rejected?: string, node?: GameNode, nodeId?: string): void {
    this.send({
      type: 'node:create:ack',
      sessionId: this.config.sessionId,
      sourceClientId: this.clientId,
      targetClientId: this.boundEditorClientId,
      requestId: message.requestId,
      parentNodeId: message.parentNodeId,
      nodeId,
      instanceId: node?.instanceId,
      name: node?.debugName(),
      applied,
      rejected,
      sentAt: Date.now(),
    });
  }

  private applyNodeDelete(message: DebugNodeDeleteMessage): void {
    const node = this.findNodeTarget(message.nodeId, message.instanceId);
    if (!node) {
      this.sendNodeDeleteAck(message, false, 'Node nicht gefunden.');
      return;
    }
    if (!node.parent) {
      this.sendNodeDeleteAck(message, false, 'Root/Persistent Nodes können live nicht gelöscht werden.');
      return;
    }
    const name = node.debugName();
    const instanceId = node.instanceId;
    const deletedRefs = this.collectNodeTreeRefs(node);
    node.parent.removeChild(node);
    this.unregisterNodeTreeRefs(deletedRefs);
    if (deletedRefs.some((ref) => ref.nodeId === this.selectedNodeId || ref.instanceId === this.selectedNodeId)) {
      this.selectedNodeId = undefined;
      this.selectedOverlayLayerIds = undefined;
      this.lastSelectedPropsSignature = '';
    }
    this.sendNodeDefinitions();
    this.sendTreeSnapshot();
    this.sendNodeDeleteAck(message, true, undefined, name, instanceId);
  }

  private collectNodeTreeRefs(node: GameNode): { node: GameNode; nodeId?: string; instanceId?: string }[] {
    return [
      { node, nodeId: this.nodeIds.get(node), instanceId: node.instanceId },
      ...node.children.flatMap((child) => this.collectNodeTreeRefs(child)),
    ];
  }

  private unregisterNodeTreeRefs(refs: readonly { node: GameNode; nodeId?: string; instanceId?: string }[]): void {
    for (const ref of refs) {
      if (ref.nodeId) this.nodesById.delete(ref.nodeId);
      if (ref.instanceId) {
        this.nodesById.delete(ref.instanceId);
        this.nodesByInstanceId.delete(ref.instanceId);
      }
      this.nodeIds.delete(ref.node);
    }
  }

  private applyNodeMove(message: DebugNodeMoveMessage): void {
    const node = this.findNodeTarget(message.nodeId);
    const target = this.findNodeTarget(message.targetNodeId);
    if (!node || !target) {
      this.sendNodeMoveAck(message, false, !node ? 'Node nicht gefunden.' : 'Target Node nicht gefunden.');
      return;
    }
    if (!node.parent) {
      this.sendNodeMoveAck(message, false, 'Root/Persistent Nodes können live nicht verschoben werden.');
      return;
    }
    if (node === target || this.isNodeDescendant(target, node)) {
      this.sendNodeMoveAck(message, false, 'Node kann nicht in sich selbst oder seinen eigenen Subtree verschoben werden.');
      return;
    }

    const oldParent = node.parent;
    const oldIndex = oldParent.children.indexOf(node);
    const newParent = message.placement === 'child' ? target : target.parent;
    if (!newParent) {
      this.sendNodeMoveAck(message, false, 'Root-Level Reordering ist live nicht erlaubt.');
      return;
    }

    let insertIndex = message.placement === 'child' ? 0 : newParent.children.indexOf(target) + (message.placement === 'after' ? 1 : 0);
    if (insertIndex < 0) {
      this.sendNodeMoveAck(message, false, 'Target Index konnte nicht bestimmt werden.');
      return;
    }
    if (oldParent === newParent && oldIndex >= 0 && oldIndex < insertIndex) insertIndex -= 1;
    if (oldParent === newParent && oldIndex === insertIndex) {
      this.sendNodeMoveAck(message, true);
      return;
    }

    if (!oldParent.detachChildForMove(node)) {
      this.sendNodeMoveAck(message, false, 'Node konnte nicht aus Parent entfernt werden.');
      return;
    }
    newParent.insertChildAt(node, insertIndex);
    this.sendNodeDefinitions();
    this.sendTreeSnapshot();
    this.sendSelectedNodeProps(true);
    this.sendNodeMoveAck(message, true);
  }

  private isNodeDescendant(candidate: GameNode, ancestor: GameNode): boolean {
    let parent = candidate.parent;
    while (parent) {
      if (parent === ancestor) return true;
      parent = parent.parent;
    }
    return false;
  }

  private sendNodeMoveAck(message: DebugNodeMoveMessage, applied: boolean, rejected?: string): void {
    this.send({
      type: 'node:move:ack',
      sessionId: this.config.sessionId,
      sourceClientId: this.clientId,
      targetClientId: this.boundEditorClientId,
      requestId: message.requestId,
      nodeId: message.nodeId,
      targetNodeId: message.targetNodeId,
      placement: message.placement,
      applied,
      rejected,
      sentAt: Date.now(),
    });
  }

  private sendNodeDeleteAck(message: DebugNodeDeleteMessage, applied: boolean, rejected?: string, name?: string, instanceId?: string): void {
    this.send({
      type: 'node:delete:ack',
      sessionId: this.config.sessionId,
      sourceClientId: this.clientId,
      targetClientId: this.boundEditorClientId,
      requestId: message.requestId,
      nodeId: message.nodeId,
      instanceId: instanceId ?? message.instanceId,
      name,
      applied,
      rejected,
      sentAt: Date.now(),
    });
  }

  private applyNodePatch(message: DebugNodePatchMessage): void {
    const node = this.findPatchTarget(message);
    if (!node) {
      this.send({
        type: 'node:patch:ack',
        sessionId: this.config.sessionId,
        nodeId: message.nodeId,
        instanceId: message.instanceId,
        name: message.name,
        applied: {},
        rejected: { target: 'Node nicht gefunden.' },
        sentAt: Date.now(),
      });
      return;
    }

    console.log('[Gravity Dig Debug][patch]', 'apply:start', { target: node.debugName(), instanceId: node.instanceId, props: message.props });
    const result = node.applySceneProps(message.props);
    console.log('[Gravity Dig Debug][patch]', 'apply:result', { target: node.debugName(), result, localTransform: node.getLocalTransform(), props: node.getDebugProps() });
    const nodeId = this.getStableNodeId(node);
    this.send({
      type: 'node:patch:ack',
      sessionId: this.config.sessionId,
      nodeId,
      instanceId: node.instanceId,
      name: node.debugName(),
      applied: result.applied,
      rejected: result.rejected,
      sentAt: Date.now(),
    });
    this.sendNodeProps(nodeId, node, true);
    this.sendTreeDeltas();
  }

  private findPatchTarget(message: DebugNodePatchMessage): GameNode | undefined {
    return this.findNodeTarget(message.nodeId, message.instanceId) ?? (message.name ? this.ctx?.getNode(message.name) : undefined);
  }

  private findNodeTarget(nodeId?: string, instanceId?: string): GameNode | undefined {
    if (instanceId) return this.nodesByInstanceId.get(instanceId) ?? this.nodesById.get(instanceId);
    if (nodeId) return this.nodesById.get(nodeId);
    return undefined;
  }

  private drawSelectedNodeOverlay(): void {
    const overlay = this.overlay;
    if (!overlay || !this.selectedNodeId) {
      overlay?.clear().setVisible(false);
      return;
    }

    const node = this.nodesById.get(this.selectedNodeId);
    if (!node) {
      overlay.clear().setVisible(false);
      return;
    }
    overlay.clear().setScrollFactor(1);
    const didRender = node.renderDebugOverlay({ graphics: overlay, selected: true, enabledLayerIds: this.selectedOverlayLayerIds });
    overlay.setVisible(didRender);
  }

  private sendSelectedNodeProps(force = false): void {
    if (!this.selectedNodeId) return;
    const node = this.nodesById.get(this.selectedNodeId);
    if (!node) return;
    this.sendNodeProps(this.selectedNodeId, node, force);
  }

  private sendNodeProps(nodeId: string, node: GameNode, force = false): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;

    const message = {
      type: 'node:props' as const,
      sessionId: this.config.sessionId,
      nodeId,
      instanceId: node.instanceId,
      bounds: node.getDebugBounds(),
      localTransform: node.getLocalTransform(),
      worldTransform: node.getWorldTransform(),
      worldBounds: node.getWorldBounds(),
      props: node.getDebugProps(),
      sentAt: Date.now(),
    };
    const signature = this.createSelectedPropsSignature(message);
    if (nodeId === this.selectedNodeId) {
      if (!force && signature === this.lastSelectedPropsSignature) return;
      this.lastSelectedPropsSignature = signature;
    }

    this.send(message);
  }

  private createSelectedPropsSignature(message: Extract<DebugMessage, { type: 'node:props' }>): string {
    return JSON.stringify({
      nodeId: message.nodeId,
      instanceId: message.instanceId,
      bounds: message.bounds,
      localTransform: message.localTransform,
      worldTransform: message.worldTransform,
      worldBounds: message.worldBounds,
      props: message.props,
    });
  }

  private parseMessage(data: unknown): DebugMessage | undefined {
    if (typeof data !== 'string') return undefined;
    try {
      return JSON.parse(data) as DebugMessage;
    } catch {
      return undefined;
    }
  }

  private scheduleReconnect(): void {
    this.socket = undefined;
    const delayMs = Math.min(10_000, 1_000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => this.connect(), delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === undefined) return;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }
}


interface DebugImageSourcePayload {
  id: string;
  path: string;
  url?: string;
  frameKey?: string;
  rect?: { x: number; y: number; width: number; height: number };
}

function debugImageSourceFromProps(props: Record<string, unknown> | undefined): DebugImageSourcePayload | undefined {
  const value = props?.debugImageSource;
  if (typeof value !== 'object' || value === null) return undefined;
  const source = value as Partial<DebugImageSourcePayload>;
  if (typeof source.id !== 'string' || typeof source.path !== 'string') return undefined;
  if (source.url !== undefined && typeof source.url !== 'string') return undefined;
  if (source.frameKey !== undefined && typeof source.frameKey !== 'string') return undefined;
  if (source.rect !== undefined && !isDebugAssetRect(source.rect)) return undefined;
  return { id: source.id, path: source.path, url: source.url, frameKey: source.frameKey, rect: source.rect };
}

function isDebugNodeCreateDefinition(value: unknown): value is DebugNodeCreateMessage['definition'] {
  if (typeof value !== 'object' || value === null) return false;
  const definition = value as { nodeTypeId?: unknown };
  return typeof definition.nodeTypeId === 'string';
}

function isDebugAssetRect(value: unknown): value is { x: number; y: number; width: number; height: number } {
  if (typeof value !== 'object' || value === null) return false;
  const rect = value as { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
  return typeof rect.x === 'number' && typeof rect.y === 'number' && typeof rect.width === 'number' && typeof rect.height === 'number';
}
