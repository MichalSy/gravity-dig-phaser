'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Image as ImageIcon, RefreshCw, RotateCcw } from 'lucide-react';
import type { DebugImageAnimationDescriptor, DebugImageAssetDescriptor, DebugMessage, DebugNodeDelta, DebugNodeDescriptor, DebugNodePropsMessage } from '@gravity-dig/debug-protocol';
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
  const [imageAssets, setImageAssets] = useState<DebugImageAssetDescriptor[]>([]);
  const [animations, setAnimations] = useState<DebugImageAnimationDescriptor[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>();
  const [originalAssetId, setOriginalAssetId] = useState<string | undefined>();
  const [lastEvent, setLastEvent] = useState('Warte auf Game...');
  const [gameFrameKey, setGameFrameKey] = useState(0);
  const reconnectTimerRef = useRef<number | undefined>(undefined);
  const socketRef = useRef<WebSocket | null>(null);
  const debugGameUrl = useMemo(() => (sessionId ? buildDebugGameUrl(sessionId) : ''), [sessionId]);
  const selectedNode = useMemo(
    () => (selectedNodeId ? findNode(treeRoots, selectedNodeId) : undefined),
    [selectedNodeId, treeRoots],
  );
  const selectedAsset = useMemo(
    () => (selectedAssetId ? imageAssets.find((asset) => asset.id === selectedAssetId) : undefined),
    [imageAssets, selectedAssetId],
  );
  const originalAsset = useMemo(
    () => (originalAssetId ? imageAssets.find((asset) => asset.id === originalAssetId) : undefined),
    [imageAssets, originalAssetId],
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

      if (message.type === 'asset:list') {
        setImageAssets(message.images);
        setAnimations(message.animations);
        setSelectedAssetId((current) => current && message.images.some((asset) => asset.id === current) ? current : message.images[0]?.id);
        setLastEvent(`Assets geladen: ${message.images.length} Bilder`);
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
    setImageAssets([]);
    setAnimations([]);
    setSelectedAssetId(undefined);
    setOriginalAssetId(undefined);
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
          <AssetExplorer
            assets={imageAssets}
            animations={animations}
            selectedAssetId={selectedAssetId}
            selectedAsset={selectedAsset}
            onSelectAsset={setSelectedAssetId}
            onOpenOriginal={setOriginalAssetId}
          />
        </section>

        <aside className={styles.panel}>
          <PanelHeader title="Inspector" meta={selectedNode ? selectedNode.name : 'Kein Node'} />
          <div className={styles.panelBody}>
            {selectedNode ? <Inspector node={selectedNode} debugProps={selectedNodeProps} /> : <p className={styles.empty}>Wähle einen Node in der Hierarchy.</p>}
          </div>
        </aside>
      </section>
      {originalAsset && <OriginalAssetDialog asset={originalAsset} onClose={() => setOriginalAssetId(undefined)} />}
    </main>
  );
}

function AssetExplorer({
  assets,
  animations,
  selectedAssetId,
  selectedAsset,
  onSelectAsset,
  onOpenOriginal,
}: {
  assets: DebugImageAssetDescriptor[];
  animations: DebugImageAnimationDescriptor[];
  selectedAssetId?: string;
  selectedAsset?: DebugImageAssetDescriptor;
  onSelectAsset(id: string): void;
  onOpenOriginal(id: string): void;
}) {
  return (
    <section className={styles.assetExplorer}>
      <PanelHeader title="Asset Explorer" meta={`${assets.length} Images · ${animations.length} Animations`} />
      <div className={styles.assetExplorerBody}>
        <div className={styles.assetGrid}>
          {assets.length > 0 ? assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className={`${styles.assetTile} ${asset.id === selectedAssetId ? styles.selectedAssetTile : ''}`}
              onClick={() => onSelectAsset(asset.id)}
            >
              <AssetPreview asset={asset} compact />
              <span>{asset.id}</span>
              <small>{asset.kind} · {asset.width}×{asset.height}</small>
            </button>
          )) : <p className={styles.empty}>Noch keine ImageAssets vom Game empfangen.</p>}
        </div>
        <AssetDetails asset={selectedAsset} onOpenOriginal={onOpenOriginal} />
      </div>
    </section>
  );
}

function AssetDetails({ asset, onOpenOriginal }: { asset?: DebugImageAssetDescriptor; onOpenOriginal(id: string): void }) {
  if (!asset) return <aside className={styles.assetDetails}><p className={styles.empty}>Wähle ein Asset.</p></aside>;

  return (
    <aside className={styles.assetDetails}>
      <button type="button" className={styles.assetPreviewLarge} onClick={() => onOpenOriginal(asset.id)} aria-label={`${asset.id} groß anzeigen`}>
        <AssetPreview asset={asset} />
        <span className={styles.assetPreviewHint}>Klick für Großansicht</span>
      </button>
      <div className={styles.assetMetaPanel}>
        <div className={styles.assetMetaHeader}>
          <strong>{asset.id}</strong>
          <span>{asset.kind} · {asset.width}×{asset.height}</span>
        </div>
        <div className={styles.assetMetaGrid}>
          <FragmentRow name="id" value={asset.id} />
          <FragmentRow name="kind" value={asset.kind} />
          <FragmentRow name="textureKey" value={asset.textureKey} />
          <FragmentRow name="width" value={asset.width} />
          <FragmentRow name="height" value={asset.height} />
          <FragmentRow name="url" value={asset.url ?? null} />
          <FragmentRow name="frameKey" value={asset.frameKey ?? null} />
          <FragmentRow name="sourceImageId" value={asset.sourceImageId ?? null} />
          <FragmentRow name="sourceUrl" value={asset.sourceUrl ?? null} />
          <FragmentRow name="rect" value={asset.rect ? `${asset.rect.x},${asset.rect.y} ${asset.rect.width}×${asset.rect.height}` : null} />
        </div>
      </div>
    </aside>
  );
}

function AssetPreview({ asset, compact = false }: { asset: DebugImageAssetDescriptor; compact?: boolean }) {
  const src = asset.kind === 'frame' ? asset.sourceUrl : asset.url;
  if (!src) return <div className={styles.assetPreviewMissing}>Keine URL</div>;
  if (asset.kind === 'frame' && asset.rect) return <FramePreview asset={asset} compact={compact} />;
  return <img className={compact ? styles.assetThumbnail : styles.assetImagePreview} src={src} alt={asset.id} loading="lazy" />;
}

function FramePreview({ asset, compact }: { asset: DebugImageAssetDescriptor; compact: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!asset.sourceUrl || !asset.rect || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      canvas.width = asset.rect?.width ?? asset.width;
      canvas.height = asset.rect?.height ?? asset.height;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, asset.rect!.x, asset.rect!.y, asset.rect!.width, asset.rect!.height, 0, 0, canvas.width, canvas.height);
    };
    image.src = asset.sourceUrl;
  }, [asset]);

  return <canvas ref={canvasRef} className={compact ? styles.assetThumbnail : styles.assetImagePreview} aria-label={asset.id} />;
}

function OriginalAssetDialog({ asset, onClose }: { asset: DebugImageAssetDescriptor; onClose(): void }) {
  const src = asset.kind === 'frame' ? asset.sourceUrl : asset.url;
  return (
    <div className={styles.dialogBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.assetDialog} onClick={(event) => event.stopPropagation()}>
        <div className={styles.dialogHeader}>
          <strong>{asset.id}</strong>
          <button type="button" className={styles.headerButton} onClick={onClose}>Schließen</button>
        </div>
        {src ? <img className={styles.originalAssetImage} src={src} alt={asset.id} /> : <p className={styles.empty}>Keine URL vorhanden.</p>}
      </div>
    </div>
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
