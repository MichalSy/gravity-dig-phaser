import Phaser from 'phaser';
import type { DebugMessage } from '@gravity-dig/debug-protocol';
import { GameNode, type NodeContext } from '../nodes';
import type { DebugConnectionConfig } from './debugConfig';
import { captureDebugNodeTree, diffDebugNodeTrees, type DebugNodeTreeSnapshot } from './debugNodeTree';

export class DebugBridgeNode extends GameNode {
  private readonly config: DebugConnectionConfig;
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
  private nextNodeId = 1;
  private selectedNodeId?: string;
  private propsElapsedMs = 0;
  private overlay?: Phaser.GameObjects.Graphics;

  constructor(config: DebugConnectionConfig) {
    super({ name: 'debugBridge', order: -100, className: 'DebugBridgeNode' });
    this.config = config;
  }

  init(ctx: NodeContext): void {
    GameNode.debugLayoutEnabled = true;
    this.ctx = ctx;
    this.overlay = ctx.phaserScene.add.graphics().setDepth(100_000).setVisible(false);
    ctx.phaserScene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.afterSceneUpdate, this);
    this.connect();
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
    this.nodesById.clear();
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
      this.send({ type: 'hello', role: 'game', sessionId: this.config.sessionId });
      this.sendAssetList();
      this.sendTreeSnapshot();
      console.info('[Gravity Dig Debug] connected', this.config);
    });

    socket.addEventListener('message', (event) => {
      const message = this.parseMessage(event.data);
      if (!message || !('sessionId' in message) || message.sessionId !== this.config.sessionId) return;
      if (message.type === 'relay:status' && message.editors > 0) {
        this.sendAssetList();
        this.sendTreeSnapshot();
        this.sendSelectedNodeProps();
      }
      if (message.type === 'node:select') {
        this.selectedNodeId = message.nodeId;
        this.propsElapsedMs = 100;
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
      this.socket.send(JSON.stringify(message));
    }
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

  private sendTreeSnapshot(): void {
    if (!this.ctx) return;

    const snapshot = captureDebugNodeTree(this.ctx.runtime, (node) => this.getStableNodeId(node), this);
    this.lastTree = snapshot;
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
    if (deltas.length > 0) this.send({ type: 'node:delta', sessionId: this.config.sessionId, deltas, sentAt: Date.now() });
  }

  private getStableNodeId(node: GameNode): string {
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
    const bounds = node.getDebugBounds();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      overlay.clear().setVisible(false);
      return;
    }

    const scrollFactor = bounds.scrollFactor ?? 1;
    const parentAnchor = node.getWorldParentAnchorPosition();
    const nodeAnchor = node.getWorldPosition();

    overlay
      .clear()
      .setVisible(true)
      .setScrollFactor(scrollFactor)
      .lineStyle(3, 0x38bdf8, 1)
      .strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
      .lineStyle(1, 0xffffff, 0.9)
      .strokeRect(bounds.x - 3, bounds.y - 3, bounds.width + 6, bounds.height + 6);

    if (parentAnchor) {
      overlay
        .lineStyle(1, 0xfacc15, 0.78)
        .lineBetween(parentAnchor.x, parentAnchor.y, nodeAnchor.x, nodeAnchor.y)
        .fillStyle(0xfacc15, 1)
        .fillCircle(parentAnchor.x, parentAnchor.y, 4)
        .lineStyle(2, 0x020617, 0.9)
        .strokeCircle(parentAnchor.x, parentAnchor.y, 6);
    }

    overlay
      .fillStyle(0xfb7185, 1)
      .fillCircle(nodeAnchor.x, nodeAnchor.y, 4)
      .lineStyle(2, 0x020617, 0.9)
      .strokeCircle(nodeAnchor.x, nodeAnchor.y, 6)
      .lineStyle(1, 0xfb7185, 0.95)
      .lineBetween(nodeAnchor.x - 8, nodeAnchor.y, nodeAnchor.x + 8, nodeAnchor.y)
      .lineBetween(nodeAnchor.x, nodeAnchor.y - 8, nodeAnchor.x, nodeAnchor.y + 8);
  }

  private sendSelectedNodeProps(): void {
    if (!this.selectedNodeId || this.socket?.readyState !== WebSocket.OPEN) return;
    const node = this.nodesById.get(this.selectedNodeId);
    if (!node) return;

    this.send({
      type: 'node:props',
      sessionId: this.config.sessionId,
      nodeId: this.selectedNodeId,
      bounds: node.getDebugBounds(),
      localTransform: node.getLocalTransform(),
      worldTransform: node.getWorldTransform(),
      worldBounds: node.getWorldBounds(),
      props: node.getDebugProps(),
      sentAt: Date.now(),
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
