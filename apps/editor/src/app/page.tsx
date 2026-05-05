'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Image as ImageIcon, RefreshCw, RotateCcw } from 'lucide-react';
import type { DebugMessage, DebugNodeDelta, DebugNodeDescriptor, DebugNodePropsMessage } from '@gravity-dig/debug-protocol';
import styles from './page.module.css';

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `debug-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isLocalEditorHost(): boolean {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
}

function defaultRelayUrl(): string {
  const configured = process.env.NEXT_PUBLIC_DEBUG_RELAY_URL;
  if (configured) return configured;
  return isLocalEditorHost() ? 'ws://localhost:8787/debug' : 'wss://gravity-dig-relay.sytko.de/debug';
}

function defaultGameUrl(): string {
  const configured = process.env.NEXT_PUBLIC_GAME_URL;
  if (configured) return configured;
  return isLocalEditorHost() ? 'http://localhost:5173' : 'https://gravity-dig-phaser.sytko.de';
}

function buildDebugGameUrl(sessionId: string): string {
  const url = new URL(defaultGameUrl());
  url.searchParams.set('debug', '1');
  url.searchParams.set('debugSession', sessionId);
  url.searchParams.set('debugRelay', defaultRelayUrl());
  return url.toString();
}

export default function Home() {
  const [sessionId, setSessionId] = useState('');
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [gameCount, setGameCount] = useState(0);
  const [treeRoots, setTreeRoots] = useState<DebugNodeDescriptor[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set());
  const [selectedNodeProps, setSelectedNodeProps] = useState<DebugNodePropsMessage | undefined>();
  const [lastEvent, setLastEvent] = useState('Warte auf Game...');
  const [gameFrameKey, setGameFrameKey] = useState(0);
  const reconnectTimerRef = useRef<number | undefined>(undefined);
  const socketRef = useRef<WebSocket | null>(null);
  const debugGameUrl = useMemo(() => (sessionId ? buildDebugGameUrl(sessionId) : ''), [sessionId]);
  const selectedNode = useMemo(
    () => (selectedNodeId ? findNode(treeRoots, selectedNodeId) : undefined),
    [selectedNodeId, treeRoots],
  );

  useEffect(() => {
    setSessionId(createSessionId());
  }, []);

  useEffect(() => {
    if (!sessionId) return;
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
        setExpandedNodeIds(new Set(collectNodeIds(message.roots)));
        setSelectedNodeId((current) => current ?? message.roots[0]?.id);
        setLastEvent(`Node Tree geladen: ${countNodes(message.roots)} Nodes`);
        return;
      }

      if (message.type === 'node:delta') {
        setTreeRoots((current) => {
          const next = applyNodeDeltas(current, message.deltas);
          setExpandedNodeIds((expanded) => reconcileExpandedNodeIds(expanded, next, message.deltas));
          setSelectedNodeId((selected) => (selected && findNode(next, selected) ? selected : next[0]?.id));
          return next;
        });
        setLastEvent(`${message.deltas.length} Node-Änderung(en)`);
        return;
      }

      if (message.type === 'node:props') {
        setSelectedNodeProps(message);
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

  useEffect(() => {
    setSelectedNodeProps(undefined);
    if (!sessionId || socketRef.current?.readyState !== WebSocket.OPEN) return;
    const selectMessage: DebugMessage = { type: 'node:select', sessionId, nodeId: selectedNodeId, sentAt: Date.now() };
    socketRef.current.send(JSON.stringify(selectMessage));
  }, [selectedNodeId, sessionId]);

  function openGameInTab(): void {
    if (!debugGameUrl) return;
    window.open(debugGameUrl, '_blank', 'noopener,noreferrer');
  }

  function reloadGameFrame(): void {
    setGameFrameKey((current) => current + 1);
  }

  function newSession(): void {
    setTreeRoots([]);
    setSelectedNodeId(undefined);
    setExpandedNodeIds(new Set());
    setSelectedNodeProps(undefined);
    setGameCount(0);
    setLastEvent('Neue Session bereit.');
    setSessionId(createSessionId());
    setGameFrameKey((current) => current + 1);
  }

  function expandAllNodes(): void {
    setExpandedNodeIds(new Set(collectNodeIds(treeRoots)));
  }

  function collapseAllNodes(): void {
    setExpandedNodeIds(new Set());
  }

  function toggleNodeExpanded(nodeId: string): void {
    setExpandedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
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
          <PanelHeader title="Hierarchy" meta={`${countNodes(treeRoots)} Nodes`}>
            <button type="button" className={styles.headerButton} onClick={expandAllNodes}>Alle auf</button>
            <button type="button" className={styles.headerButton} onClick={collapseAllNodes}>Alle zu</button>
          </PanelHeader>
          <div className={styles.panelBody}>
            {treeRoots.length > 0 ? (
              <NodeTree nodes={treeRoots} selectedNodeId={selectedNodeId} expandedNodeIds={expandedNodeIds} onSelectNode={setSelectedNodeId} onToggleNode={toggleNodeExpanded} />
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
                src={debugGameUrl || 'about:blank'}
                allow="gamepad; fullscreen"
              />
            </div>
          </div>
        </section>

        <aside className={styles.panel}>
          <PanelHeader title="Inspector" meta={selectedNode ? selectedNode.name : 'Kein Node'} />
          <div className={styles.panelBody}>
            {selectedNode ? <Inspector node={selectedNode} debugProps={selectedNodeProps} /> : <p className={styles.empty}>Wähle einen Node in der Hierarchy.</p>}
          </div>
        </aside>
      </section>
    </main>
  );
}

function PanelHeader({ title, meta, children }: { title: string; meta: string; children?: ReactNode }) {
  return (
    <div className={styles.panelHeader}>
      <h2>{title}</h2>
      <div className={styles.panelHeaderMeta}>
        <span>{meta}</span>
        {children}
      </div>
    </div>
  );
}

function NodeTree({
  nodes,
  selectedNodeId,
  expandedNodeIds,
  onSelectNode,
  onToggleNode,
}: {
  nodes: DebugNodeDescriptor[];
  selectedNodeId?: string;
  expandedNodeIds: ReadonlySet<string>;
  onSelectNode(id: string): void;
  onToggleNode(id: string): void;
}) {
  return (
    <ol className={styles.treeList}>
      {nodes.map((node) => (
        <NodeTreeItem key={node.id} node={node} selectedNodeId={selectedNodeId} expandedNodeIds={expandedNodeIds} onSelectNode={onSelectNode} onToggleNode={onToggleNode} />
      ))}
    </ol>
  );
}

function NodeTreeItem({
  node,
  selectedNodeId,
  expandedNodeIds,
  onSelectNode,
  onToggleNode,
}: {
  node: DebugNodeDescriptor;
  selectedNodeId?: string;
  expandedNodeIds: ReadonlySet<string>;
  onSelectNode(id: string): void;
  onToggleNode(id: string): void;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedNodeIds.has(node.id);

  return (
    <li className={styles.treeItem}>
      <div className={`${styles.nodeRow} ${!node.active ? styles.inactiveNode : ''} ${node.id === selectedNodeId ? styles.selectedNode : ''}`}>
        <button
          type="button"
          className={styles.expandButton}
          disabled={!hasChildren}
          aria-label={hasChildren ? (isExpanded ? `${node.name} einklappen` : `${node.name} aufklappen`) : undefined}
          onClick={() => onToggleNode(node.id)}
        >
          {hasChildren ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className={styles.expandSpacer} />}
        </button>
        <button type="button" className={styles.nodeContent} onClick={() => onSelectNode(node.id)}>
          {isImageNode(node) && <ImageIcon className={styles.nodeIcon} size={14} />}
          <span className={styles.nodeName}>{node.name}</span>
          <span className={styles.nodeMeta}>{node.className}</span>
          {!node.active && <span className={styles.nodeFlag}>inactive</span>}
          {!node.visible && <span className={styles.nodeFlag}>hidden</span>}
        </button>
      </div>
      {hasChildren && isExpanded && <NodeTree nodes={node.children} selectedNodeId={selectedNodeId} expandedNodeIds={expandedNodeIds} onSelectNode={onSelectNode} onToggleNode={onToggleNode} />}
    </li>
  );
}

function isImageNode(node: DebugNodeDescriptor): boolean {
  const className = node.className.toLowerCase();
  const name = node.name.toLowerCase();
  return className.includes('imagenode') || name.includes('image');
}

function Inspector({ node, debugProps }: { node: DebugNodeDescriptor; debugProps?: DebugNodePropsMessage }) {
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
      <div>
        <label>Debug Bounds</label>
        <code>{debugProps?.bounds ? `${Math.round(debugProps.bounds.x)}, ${Math.round(debugProps.bounds.y)} · ${Math.round(debugProps.bounds.width)}×${Math.round(debugProps.bounds.height)}` : 'Keine Bounds exposed'}</code>
      </div>
      <div>
        <label>Exposed Props</label>
        <div className={styles.inspectorGrid}>
          {debugProps ? Object.entries(debugProps.props).map(([key, value]) => (
            <FragmentRow key={key} name={key} value={value} />
          )) : (
            <>
              <span>Status</span>
              <strong>Warte auf Node-Debugdaten...</strong>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ name, value }: { name: string; value: string | number | boolean | null }) {
  return (
    <>
      <span>{name}</span>
      <strong>{value === null ? 'null' : String(value)}</strong>
    </>
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

function collectNodeIds(nodes: DebugNodeDescriptor[]): string[] {
  return nodes.flatMap((node) => [node.id, ...collectNodeIds(node.children)]);
}

function reconcileExpandedNodeIds(expanded: ReadonlySet<string>, roots: DebugNodeDescriptor[], deltas: DebugNodeDelta[]): Set<string> {
  if (expanded.size === 0) return new Set();
  const existingIds = new Set(collectNodeIds(roots));
  const next = new Set([...expanded].filter((id) => existingIds.has(id)));

  for (const delta of deltas) {
    if (delta.kind === 'added' && delta.node) next.add(delta.id);
  }

  return next;
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
