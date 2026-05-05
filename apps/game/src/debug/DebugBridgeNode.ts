import type { DebugMessage } from '@gravity-dig/debug-protocol';
import { GameNode } from '../nodes';
import type { DebugConnectionConfig } from './debugConfig';

export class DebugBridgeNode extends GameNode {
  private readonly config: DebugConnectionConfig;
  private socket?: WebSocket;
  private reconnectTimer?: number;
  private reconnectAttempts = 0;

  constructor(config: DebugConnectionConfig) {
    super({ name: 'debugBridge', order: -100 });
    this.config = config;
  }

  init(): void {
    this.connect();
  }

  destroy(): void {
    this.clearReconnectTimer();
    this.socket?.close();
    this.socket = undefined;
  }

  private connect(): void {
    this.clearReconnectTimer();
    const socket = new WebSocket(this.config.relayUrl);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.send({ type: 'hello', role: 'game', sessionId: this.config.sessionId });
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
