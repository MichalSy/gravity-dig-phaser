'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, RotateCcw } from 'lucide-react';
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [lastEvent, setLastEvent] = useState('Warte auf Game...');
  const [gameFrameKey, setGameFrameKey] = useState(0);
  const reconnectTimerRef = useRef<number | undefined>(undefined);
  const socketRef = useRef<WebSocket | null>(null);
  const debugGameUrl = useMemo(() => buildDebugGameUrl(sessionId), [sessionId]);
  const selectedNode = useMemo(
    () => (selectedNodeId ? findNode(treeRoots, selectedNodeId) : undefined),
    [selectedNodeId, treeRoots],
  );

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
        setLastEvent('Relay verbunden. Game wird im Editor geladen.');
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
        setSelectedNodeId((current) => current ?? message.roots[0]?.id);
        setLastEvent(`Node Tree geladen: ${countNodes(message.roots)} Nodes`);
        return;
      }

      if (message.type === 'node:delta') {
        setTreeRoots((current) => {
          const next = applyNodeDeltas(current, message.deltas);
          setSelectedNodeId((selected) => (selected && findNode(next, selected) ? selected : next[0]?.id));
          return next;
        });
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

  function openGameInTab(): void {
    window.open(debugGameUrl, '_blank', 'noopener,noreferrer');
  }

  function reloadGameFrame(): void {
    setGameFrameKey((current) => current + 1);
  }

  function newSession(): void {
    setTreeRoots([]);
    setSelectedNodeId(undefined);
    setGameCount(0);
    setLastEvent('Neue Session bereit.');
    setSessionId(createSessionId());
    setGameFrameKey((current) => current + 1);
  }

  const statusText = status === 'connected' ? 'Relay verbunden' : status === 'connecting' ? 'Verbinde...' : 'Getrennt';
  const gameText = gameCount > 0 ? 'Game verbunden' : 'Game lädt...';

  return (
    <main className={styles.appShell}>
      <header className={styles.toolbar}>
        <div className={styles.brandBlock}>
          <span className={styles.eyebrow}>Gravity Dig</span>
          <h1 className={styles.title}>Debug Editor</h1>
        </div>
        <div className={styles.statusStack}>
          <span className={`${styles.badge} ${styles[status]}`}>{statusText}</span>
          <span className={`${styles.badge} ${gameCount > 0 ? styles.connected : styles.connecting}`}>{gameText}</span>
        </div>
        <div className={styles.actions}>
          <button className={styles.button} onClick={reloadGameFrame}>
            <RotateCcw size={16} /> Game neu laden
          </button>
          <button className={`${styles.button} ${styles.secondary}`} onClick={openGameInTab}>
            <ExternalLink size={16} /> Neuer Tab
          </button>
          <button className={`${styles.button} ${styles.ghost}`} onClick={newSession}>
            <RefreshCw size={16} /> Neue Session
          </button>
        </div>
      </header>

      <section className={styles.workbench}>
        <aside className={styles.panel}>
          <PanelHeader title="Hierarchy" meta={`${countNodes(treeRoots)} Nodes`} />
          <div className={styles.panelBody}>
            {treeRoots.length > 0 ? (
              <NodeTree nodes={treeRoots} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
            ) : (
              <p className={styles.empty}>Noch kein Tree. Das Game lädt im Viewport.</p>
            )}
          </div>
        </aside>

        <section className={styles.viewportPanel}>
          <PanelHeader title="Game" meta={lastEvent} />
          <div className={styles.viewportBody}>
            <div className={styles.frameStage}>
              <iframe
                key={`${sessionId}-${gameFrameKey}`}
                className={styles.gameFrame}
                title="Gravity Dig Game"
                src={debugGameUrl}
                allow="gamepad; fullscreen"
              />
            </div>
          </div>
        </section>

        <aside className={styles.panel}>
          <PanelHeader title="Inspector" meta={selectedNode ? selectedNode.name : 'Kein Node'} />
          <div className={styles.panelBody}>
            {selectedNode ? <Inspector node={selectedNode} /> : <p className={styles.empty}>Wähle einen Node in der Hierarchy.</p>}
          </div>
        </aside>
      </section>
    </main>
  );
}

function PanelHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div className={styles.panelHeader}>
      <h2>{title}</h2>
      <span>{meta}</span>
    </div>
  );
}

function NodeTree({
  nodes,
  selectedNodeId,
  onSelectNode,
}: {
  nodes: DebugNodeDescriptor[];
  selectedNodeId?: string;
  onSelectNode(id: string): void;
}) {
  return (
    <ol className={styles.treeList}>
      {nodes.map((node) => (
        <NodeTreeItem key={node.id} node={node} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} />
      ))}
    </ol>
  );
}

function NodeTreeItem({
  node,
  selectedNodeId,
  onSelectNode,
}: {
  node: DebugNodeDescriptor;
  selectedNodeId?: string;
  onSelectNode(id: string): void;
}) {
  return (
    <li className={styles.treeItem}>
      <button
        type="button"
        className={`${styles.nodeRow} ${!node.active ? styles.inactiveNode : ''} ${node.id === selectedNodeId ? styles.selectedNode : ''}`}
        onClick={() => onSelectNode(node.id)}
      >
        <span className={styles.nodeName}>{node.name}</span>
        <span className={styles.nodeMeta}>{node.className}</span>
        {!node.active && <span className={styles.nodeFlag}>inactive</span>}
        {!node.visible && <span className={styles.nodeFlag}>hidden</span>}
      </button>
      {node.children.length > 0 && <NodeTree nodes={node.children} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} />}
    </li>
  );
}

function Inspector({ node }: { node: DebugNodeDescriptor }) {
  return (
    <div className={styles.inspector}>
      <div>
        <label>Name</label>
        <strong>{node.name}</strong>
      </div>
      <div>
        <label>Class</label>
        <strong>{node.className}</strong>
      </div>
      <div>
        <label>ID</label>
        <code>{node.id}</code>
      </div>
      <div className={styles.inspectorGrid}>
        <span>Active</span>
        <strong>{node.active ? 'true' : 'false'}</strong>
        <span>Visible</span>
        <strong>{node.visible ? 'true' : 'false'}</strong>
        <span>Order</span>
        <strong>{node.order}</strong>
        <span>Index</span>
        <strong>{node.index}</strong>
        <span>Children</span>
        <strong>{node.children.length}</strong>
      </div>
    </div>
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
