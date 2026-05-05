'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import type { DebugMessage, DebugNodeDelta, DebugNodeDescriptor } from '@gravity-dig/debug-protocol';
import styles from './page.module.css';

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `debug-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultRelayUrl(): string {
  const configured = process.env.NEXT_PUBLIC_DEBUG_RELAY_URL;
  if (configured) return configured;
  if (typeof window === 'undefined') return 'ws://localhost:8787/debug';
  return window.location.protocol === 'https:'
    ? 'wss://gravity-dig-relay.sytko.de/debug'
    : 'ws://localhost:8787/debug';
}

function defaultGameUrl(): string {
  const configured = process.env.NEXT_PUBLIC_GAME_URL;
  if (configured) return configured;
  if (typeof window === 'undefined') return 'http://localhost:5173';
  return window.location.protocol === 'https:'
    ? 'https://gravity-dig-phaser.sytko.de'
    : 'http://localhost:5173';
}

function buildDebugGameUrl(sessionId: string): string {
  const url = new URL(defaultGameUrl());
  url.searchParams.set('debug', '1');
  url.searchParams.set('debugSession', sessionId);
  url.searchParams.set('debugRelay', defaultRelayUrl());
  return url.toString();
}

export default function Home() {
  const [sessionId, setSessionId] = useState(createSessionId);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [gameCount, setGameCount] = useState(0);
  const [treeRoots, setTreeRoots] = useState<DebugNodeDescriptor[]>([]);
  const [lastEvent, setLastEvent] = useState('Warte auf Game...');
  const reconnectTimerRef = useRef<number | undefined>(undefined);
  const socketRef = useRef<WebSocket | null>(null);
  const debugGameUrl = useMemo(() => buildDebugGameUrl(sessionId), [sessionId]);

  useEffect(() => {
    let disposed = false;

    function connect(): void {
      if (disposed) return;
      setStatus('connecting');
      const socket = new WebSocket(defaultRelayUrl());
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        const hello: DebugMessage = { type: 'hello', role: 'editor', sessionId };
        socket.send(JSON.stringify(hello));
        setStatus('connected');
        setLastEvent('Editor verbunden. Game starten.');
      });

      socket.addEventListener('message', (event) => {
        const message = parseDebugMessage(event.data);
        if (!message) return;
        handleMessage(message);
      });

      socket.addEventListener('close', () => {
        if (disposed) return;
        setStatus('disconnected');
        reconnectTimerRef.current = window.setTimeout(connect, 1200);
      });

      socket.addEventListener('error', () => {
        setStatus('disconnected');
        setLastEvent('Relay-Verbindung unterbrochen. Verbinde neu...');
      });
    }

    function handleMessage(message: DebugMessage): void {
      if ('sessionId' in message && message.sessionId !== sessionId) return;

      if (message.type === 'relay:status') {
        setGameCount(message.games);
        if (message.games > 0) setLastEvent('Game verbunden.');
        return;
      }

      if (message.type === 'node:tree') {
        setTreeRoots(message.roots);
        setLastEvent(`Node Tree geladen: ${countNodes(message.roots)} Nodes`);
        return;
      }

      if (message.type === 'node:delta') {
        setTreeRoots((current) => applyNodeDeltas(current, message.deltas));
        setLastEvent(`${message.deltas.length} Node-Änderung(en)`);
      }
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current !== undefined) window.clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [sessionId]);

  function openGame(): void {
    window.open(debugGameUrl, '_blank', 'noopener,noreferrer');
  }

  function newSession(): void {
    setTreeRoots([]);
    setGameCount(0);
    setLastEvent('Neue Session bereit.');
    setSessionId(createSessionId());
  }

  const statusText = status === 'connected' ? 'Relay verbunden' : status === 'connecting' ? 'Verbinde...' : 'Getrennt';
  const gameText = gameCount > 0 ? 'Game verbunden' : 'Kein Game verbunden';

  return (
    <main className={styles.shell}>
      <section className={styles.heroCard}>
        <div>
          <p className={styles.eyebrow}>Gravity Dig</p>
          <h1 className={styles.title}>Debug Editor</h1>
          <p className={styles.copy}>Automatisch gekoppelt. Game starten, Tree ansehen.</p>
        </div>
        <div className={styles.statusStack}>
          <span className={`${styles.badge} ${styles[status]}`}>{statusText}</span>
          <span className={`${styles.badge} ${gameCount > 0 ? styles.connected : styles.disconnected}`}>{gameText}</span>
        </div>
        <div className={styles.actions}>
          <button className={styles.button} onClick={openGame}>
            <ExternalLink size={18} /> Game starten
          </button>
          <button className={`${styles.button} ${styles.secondary}`} onClick={newSession}>
            <RefreshCw size={18} /> Neue Session
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.header}>
          <h2 className={styles.sectionTitle}>Node Hierarchie</h2>
          <span className={styles.muted}>{lastEvent}</span>
        </div>
        {treeRoots.length > 0 ? <NodeTree nodes={treeRoots} /> : <p className={styles.empty}>Noch kein Tree. Starte das Game.</p>}
      </section>
    </main>
  );
}

function NodeTree({ nodes }: { nodes: DebugNodeDescriptor[] }) {
  return (
    <ol className={styles.treeList}>
      {nodes.map((node) => <NodeTreeItem key={node.id} node={node} />)}
    </ol>
  );
}

function NodeTreeItem({ node }: { node: DebugNodeDescriptor }) {
  return (
    <li className={styles.treeItem}>
      <div className={`${styles.nodeRow} ${!node.active ? styles.inactiveNode : ''}`}>
        <span className={styles.nodeName}>{node.name}</span>
        <span className={styles.nodeMeta}>{node.className}</span>
        {!node.active && <span className={styles.nodeFlag}>inactive</span>}
        {!node.visible && <span className={styles.nodeFlag}>hidden</span>}
      </div>
      {node.children.length > 0 && <NodeTree nodes={node.children} />}
    </li>
  );
}

function parseDebugMessage(data: unknown): DebugMessage | undefined {
  if (typeof data !== 'string') return undefined;
  try {
    return JSON.parse(data) as DebugMessage;
  } catch {
    return undefined;
  }
}

function countNodes(nodes: DebugNodeDescriptor[]): number {
  return nodes.reduce((count, node) => count + 1 + countNodes(node.children), 0);
}

function applyNodeDeltas(roots: DebugNodeDescriptor[], deltas: DebugNodeDelta[]): DebugNodeDescriptor[] {
  const clonedRoots = cloneTree(roots);

  for (const delta of deltas) {
    if (delta.kind === 'removed') removeNode(clonedRoots, delta.id);
    if (delta.kind === 'added' && delta.node) insertNode(clonedRoots, delta.node, delta.parentId, delta.index);
    if (delta.kind === 'moved') moveNode(clonedRoots, delta.id, delta.parentId, delta.index);
    if (delta.kind === 'updated') updateNode(clonedRoots, delta.id, delta.node ?? { active: delta.active, visible: delta.visible, order: delta.order });
  }

  return clonedRoots;
}

function cloneTree(nodes: DebugNodeDescriptor[]): DebugNodeDescriptor[] {
  return nodes.map((node) => cloneNode(node));
}

function cloneNode(node: DebugNodeDescriptor): DebugNodeDescriptor {
  return { ...node, children: cloneTree(node.children) };
}

function removeNode(nodes: DebugNodeDescriptor[], id: string): DebugNodeDescriptor | undefined {
  const index = nodes.findIndex((node) => node.id === id);
  if (index >= 0) return nodes.splice(index, 1)[0];

  for (const node of nodes) {
    const removed = removeNode(node.children, id);
    if (removed) return removed;
  }

  return undefined;
}

function insertNode(nodes: DebugNodeDescriptor[], node: DebugNodeDescriptor, parentId: string | undefined, index = nodes.length): void {
  const clone = cloneNode(node);
  if (!parentId) {
    nodes.splice(index, 0, clone);
    return;
  }

  const parent = findNode(nodes, parentId);
  if (parent) parent.children.splice(index, 0, clone);
}

function moveNode(nodes: DebugNodeDescriptor[], id: string, parentId: string | undefined, index = nodes.length): void {
  const node = removeNode(nodes, id);
  if (!node) return;
  node.parentId = parentId;
  node.index = index;
  insertNode(nodes, node, parentId, index);
}

function updateNode(nodes: DebugNodeDescriptor[], id: string, patch: Partial<DebugNodeDescriptor>): void {
  const node = findNode(nodes, id);
  if (!node) return;
  Object.assign(node, patch, { children: patch.children ?? node.children });
}

function findNode(nodes: DebugNodeDescriptor[], id: string): DebugNodeDescriptor | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children, id);
    if (child) return child;
  }
  return undefined;
}
