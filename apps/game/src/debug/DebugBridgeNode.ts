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
  private readonly nodeIds = new WeakMap<GameNode, string>();
  private nextNodeId = 1;

  constructor(config: DebugConnectionConfig) {
    super({ name: 'debugBridge', order: -100 });
    this.config = config;
  }

  init(ctx: NodeContext): void {
    this.ctx = ctx;
    this.connect();
  }

  update(deltaMs: number): void {
    this.treeCheckElapsedMs += deltaMs;
    if (this.treeCheckElapsedMs < 250) return;

    this.treeCheckElapsedMs = 0;
    this.sendTreeDeltas();
  }

  destroy(): void {
    this.clearReconnectTimer();
    this.socket?.close();
    this.socket = undefined;
    this.ctx = undefined;
    this.lastTree = undefined;
  }

  private connect(): void {
    this.clearReconnectTimer();
    const socket = new WebSocket(this.config.relayUrl);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.send({ type: 'hello', role: 'game', sessionId: this.config.sessionId });
      this.sendTreeSnapshot();
      console.info('[Gravity Dig Debug] connected', this.config);
    });

    socket.addEventListener('message', (event) => {
      console.info('[Gravity Dig Debug] message', event.data);
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
    if (existing) return existing;

    const id = `node-${this.nextNodeId.toString(36)}`;
    this.nextNodeId += 1;
    this.nodeIds.set(node, id);
    return id;
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
