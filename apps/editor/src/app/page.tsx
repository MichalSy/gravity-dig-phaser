'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Image as ImageIcon, RefreshCw, RotateCcw, Search, Type as TypeIcon } from 'lucide-react';
import type { DebugImageAnimationDescriptor, DebugImageAssetDescriptor, DebugMessage, DebugNodeBounds, DebugNodeDelta, DebugNodeDescriptor, DebugNodePatch, DebugNodePropsMessage, DebugNodeTransform, DebugSceneNodeDefinition, DebugScenePropDefinition } from '@gravity-dig/debug-protocol';
import styles from './page.module.css';

function shouldLogDebugMessage(type: DebugMessage['type']): boolean {
  return type !== 'node:select' && type !== 'node:props';
}

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

const layoutStorageKey = 'gravity-dig-debug-editor-layout-v1';

interface EditorLayoutState {
  hierarchyWidth: number;
  inspectorWidth: number;
  assetExplorerHeight: number;
  assetSplitPercent: number;
}

const defaultLayoutState: EditorLayoutState = {
  hierarchyWidth: 448,
  inspectorWidth: 340,
  assetExplorerHeight: 380,
  assetSplitPercent: 58,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function applyLayoutToDocument(layout: EditorLayoutState): void {
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;
  style.setProperty('--hierarchy-width', `${layout.hierarchyWidth}px`);
  style.setProperty('--inspector-width', `${layout.inspectorWidth}px`);
  style.setProperty('--asset-explorer-height', `${layout.assetExplorerHeight}px`);
  style.setProperty('--asset-list-fr', `${layout.assetSplitPercent}fr`);
  style.setProperty('--asset-detail-fr', `${100 - layout.assetSplitPercent}fr`);
}

function persistLayout(layout: EditorLayoutState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(layoutStorageKey, JSON.stringify(layout));
  applyLayoutToDocument(layout);
}

function createResizeShield(cursor: string): HTMLDivElement | undefined {
  if (typeof document === 'undefined') return undefined;
  const shield = document.createElement('div');
  shield.style.position = 'fixed';
  shield.style.inset = '0';
  shield.style.zIndex = '2147483647';
  shield.style.cursor = cursor;
  shield.style.userSelect = 'none';
  shield.style.touchAction = 'none';
  document.body.appendChild(shield);
  return shield;
}

function readStoredLayout(): EditorLayoutState {
  if (typeof window === 'undefined') return defaultLayoutState;
  try {
    const raw = window.localStorage.getItem(layoutStorageKey);
    if (!raw) return defaultLayoutState;
    const parsed = JSON.parse(raw) as Partial<EditorLayoutState>;
    return {
      hierarchyWidth: clamp(parsed.hierarchyWidth ?? defaultLayoutState.hierarchyWidth, 320, 640),
      inspectorWidth: clamp(parsed.inspectorWidth ?? defaultLayoutState.inspectorWidth, 280, 560),
      assetExplorerHeight: clamp(parsed.assetExplorerHeight ?? defaultLayoutState.assetExplorerHeight, 240, 560),
      assetSplitPercent: clamp(parsed.assetSplitPercent ?? defaultLayoutState.assetSplitPercent, 35, 72),
    };
  } catch {
    return defaultLayoutState;
  }
}

export default function Home() {
  const [sessionId, setSessionId] = useState('');
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [gameCount, setGameCount] = useState(0);
  const [treeRoots, setTreeRoots] = useState<DebugNodeDescriptor[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set());
  const [selectedNodeProps, setSelectedNodeProps] = useState<DebugNodePropsMessage | undefined>();
  const [nodeDefinitions, setNodeDefinitions] = useState<Map<string, DebugSceneNodeDefinition>>(() => new Map());
  const [patchStatus, setPatchStatus] = useState('');
  const [imageAssets, setImageAssets] = useState<DebugImageAssetDescriptor[]>([]);
  const [animations, setAnimations] = useState<DebugImageAnimationDescriptor[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>();
  const [originalAssetId, setOriginalAssetId] = useState<string | undefined>();
  const [lastEvent, setLastEvent] = useState('Warte auf Game...');
  const [gameFrameKey, setGameFrameKey] = useState(0);
  const [layout, setLayout] = useState<EditorLayoutState>(() => readStoredLayout());
  const reconnectTimerRef = useRef<number | undefined>(undefined);
  const socketRef = useRef<WebSocket | null>(null);
  const lastSelectMessageRef = useRef<string>('');
  const workbenchRef = useRef<HTMLElement | null>(null);
  const viewportPanelRef = useRef<HTMLElement | null>(null);
  const assetExplorerBodyRef = useRef<HTMLDivElement | null>(null);
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
  const selectedNodeDefinition = useMemo(
    () => (selectedNode?.guid ? nodeDefinitions.get(selectedNode.guid) : selectedNode ? nodeDefinitions.get(selectedNode.id) : undefined),
    [nodeDefinitions, selectedNode],
  );

  useEffect(() => {
    setSessionId(createSessionId());
    const storedLayout = readStoredLayout();
    setLayout(storedLayout);
    applyLayoutToDocument(storedLayout);
    const restoreTimer = window.setTimeout(() => {
      const latestLayout = readStoredLayout();
      setLayout(latestLayout);
      applyLayoutToDocument(latestLayout);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
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
        console.log('[Gravity Dig Debug][editor->game]', hello.type, hello);
        socket.send(JSON.stringify(hello));
        setStatus('connected');
        setLastEvent('Relay verbunden. Game wird im Editor geladen.');
      });

      socket.addEventListener('message', (event) => {
        const message = parseDebugMessage(event.data);
        if (!message) return;
        if (shouldLogDebugMessage(message.type)) console.log('[Gravity Dig Debug][game->editor]', message.type, message);
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

      if (message.type === 'node:definitions') {
        setNodeDefinitions(new Map(message.nodes.map((node) => [node.guid, node])));
        setLastEvent(`Node-Definitionen geladen: ${message.nodes.length}`);
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

      if (message.type === 'node:patch:ack') {
        const rejected = Object.entries(message.rejected);
        setPatchStatus(rejected.length === 0 ? `Patch angewendet: ${Object.keys(message.applied).join(', ')}` : `Patch teilweise abgelehnt: ${rejected.map(([key, value]) => `${key}: ${value}`).join(' · ')}`);
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
    if (!selectedNodeId || !sessionId || socketRef.current?.readyState !== WebSocket.OPEN) return;
    const selectSignature = `${sessionId}:${selectedNodeId}`;
    if (lastSelectMessageRef.current === selectSignature) return;
    lastSelectMessageRef.current = selectSignature;
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

  function sendNodePatch(node: DebugNodeDescriptor, props: DebugNodePatch): void {
    if (!sessionId || socketRef.current?.readyState !== WebSocket.OPEN) {
      setPatchStatus('Patch nicht gesendet: Relay nicht verbunden.');
      return;
    }

    const message: DebugMessage = { type: 'node:patch', sessionId, nodeId: node.id, guid: node.guid, name: node.name, props, sentAt: Date.now() };
    if (shouldLogDebugMessage(message.type)) console.log('[Gravity Dig Debug][editor->game]', message.type, message);
    socketRef.current.send(JSON.stringify(message));
    setPatchStatus(`Patch gesendet: ${Object.keys(props).join(', ')}`);
  }

  function toggleNodeExpanded(nodeId: string): void {
    setExpandedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  function startColumnResize(edge: 'left' | 'right', event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const shield = createResizeShield('col-resize');
    const startX = event.clientX;
    const startLayout = readStoredLayout();
    const workbenchWidth = workbenchRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    const maxSideWidth = Math.max(320, Math.min(700, workbenchWidth - 620));

    function onPointerMove(moveEvent: PointerEvent): void {
      const deltaX = moveEvent.clientX - startX;
      setLayout((current) => {
        const next = {
          ...current,
          hierarchyWidth: edge === 'left' ? clamp(startLayout.hierarchyWidth + deltaX, 320, maxSideWidth) : current.hierarchyWidth,
          inspectorWidth: edge === 'right' ? clamp(startLayout.inspectorWidth - deltaX, 280, maxSideWidth) : current.inspectorWidth,
        };
        persistLayout(next);
        return next;
      });
    }

    function stopResize(): void {
      window.removeEventListener('pointermove', onPointerMove);
      shield?.remove();
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopResize, { once: true });
    window.addEventListener('pointercancel', stopResize, { once: true });
  }

  function startAssetHeightResize(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const shield = createResizeShield('row-resize');
    const startY = event.clientY;
    const startHeight = readStoredLayout().assetExplorerHeight;
    const panelHeight = viewportPanelRef.current?.getBoundingClientRect().height ?? window.innerHeight;
    const maxHeight = Math.max(260, panelHeight - 260);

    function onPointerMove(moveEvent: PointerEvent): void {
      setLayout((current) => {
        const next = {
          ...current,
          assetExplorerHeight: clamp(startHeight - (moveEvent.clientY - startY), 240, maxHeight),
        };
        persistLayout(next);
        return next;
      });
    }

    function stopResize(): void {
      window.removeEventListener('pointermove', onPointerMove);
      shield?.remove();
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopResize, { once: true });
    window.addEventListener('pointercancel', stopResize, { once: true });
  }

  function startAssetSplitResize(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const shield = createResizeShield('col-resize');
    const bodyRect = assetExplorerBodyRef.current?.getBoundingClientRect();
    if (!bodyRect) {
      shield?.remove();
      return;
    }
    const { left, width } = bodyRect;

    function onPointerMove(moveEvent: PointerEvent): void {
      const percent = ((moveEvent.clientX - left) / width) * 100;
      setLayout((current) => {
        const next = { ...current, assetSplitPercent: clamp(percent, 35, 72) };
        persistLayout(next);
        return next;
      });
    }

    function stopResize(): void {
      window.removeEventListener('pointermove', onPointerMove);
      shield?.remove();
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopResize, { once: true });
    window.addEventListener('pointercancel', stopResize, { once: true });
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

      <section ref={workbenchRef} className={styles.workbench}>
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

        <div className={styles.columnResizer} role="separator" aria-orientation="vertical" aria-label="Hierarchy Breite ändern" onPointerDown={(event) => startColumnResize('left', event)} />

        <section ref={viewportPanelRef} className={styles.viewportPanel}>
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
          <div className={styles.rowResizer} role="separator" aria-orientation="horizontal" aria-label="Asset Explorer Höhe ändern" onPointerDown={startAssetHeightResize} />
          <AssetExplorer
            assets={imageAssets}
            animations={animations}
            selectedAssetId={selectedAssetId}
            selectedAsset={selectedAsset}
            onSelectAsset={setSelectedAssetId}
            onOpenOriginal={setOriginalAssetId}
            bodyRef={assetExplorerBodyRef}
            onStartSplitResize={startAssetSplitResize}
          />
        </section>

        <div className={styles.columnResizer} role="separator" aria-orientation="vertical" aria-label="Inspector Breite ändern" onPointerDown={(event) => startColumnResize('right', event)} />

        <aside className={styles.panel}>
          <PanelHeader title="Inspector" meta={selectedNode ? selectedNode.name : 'Kein Node'} />
          <div className={styles.panelBody}>
            {selectedNode ? <Inspector node={selectedNode} definition={selectedNodeDefinition} debugProps={selectedNodeProps} patchStatus={patchStatus} assets={imageAssets} onPatch={sendNodePatch} onSelectAsset={setSelectedAssetId} /> : <p className={styles.empty}>Wähle einen Node in der Hierarchy.</p>}
          </div>
        </aside>
      </section>
      {originalAsset && <OriginalAssetDialog asset={originalAsset} assets={imageAssets} onClose={() => setOriginalAssetId(undefined)} />}
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
  bodyRef,
  onStartSplitResize,
}: {
  assets: DebugImageAssetDescriptor[];
  animations: DebugImageAnimationDescriptor[];
  selectedAssetId?: string;
  selectedAsset?: DebugImageAssetDescriptor;
  onSelectAsset(id: string): void;
  onOpenOriginal(id: string): void;
  bodyRef: RefObject<HTMLDivElement | null>;
  onStartSplitResize(event: ReactPointerEvent<HTMLDivElement>): void;
}) {
  return (
    <section className={styles.assetExplorer}>
      <PanelHeader title="Asset Explorer" meta={`${assets.length} Images · ${animations.length} Animations`} />
      <div ref={bodyRef} className={styles.assetExplorerBody}>
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
        <div className={styles.assetSplitResizer} role="separator" aria-orientation="vertical" aria-label="Asset Details Breite ändern" onPointerDown={onStartSplitResize} />
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

function OriginalAssetDialog({ asset, assets, onClose }: { asset: DebugImageAssetDescriptor; assets: DebugImageAssetDescriptor[]; onClose(): void }) {
  const atlasId = asset.kind === 'frame' ? asset.sourceImageId : asset.id;
  const atlasAsset = atlasId ? assets.find((candidate) => candidate.id === atlasId) : undefined;
  const frames = atlasId ? assets.filter((candidate) => candidate.kind === 'frame' && candidate.sourceImageId === atlasId && candidate.rect) : [];
  const initialFrameId = asset.kind === 'frame' ? asset.id : frames[0]?.id;
  const [selectedFrameId, setSelectedFrameId] = useState<string | undefined>(initialFrameId);
  const [activeTab, setActiveTab] = useState<'frame' | 'atlas'>('frame');

  useEffect(() => {
    setSelectedFrameId(initialFrameId);
    setActiveTab('frame');
  }, [initialFrameId]);

  const selectedFrame = selectedFrameId ? frames.find((frame) => frame.id === selectedFrameId) : undefined;
  const src = atlasAsset?.url ?? asset.sourceUrl ?? asset.url;
  const showAtlasViewer = Boolean(src && atlasAsset && frames.length > 0);

  return (
    <div className={styles.dialogBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.assetDialog} onClick={(event) => event.stopPropagation()}>
        <div className={styles.dialogHeader}>
          <strong>{atlasAsset?.id ?? asset.id}</strong>
          <div className={styles.dialogHeaderActions}>
            {showAtlasViewer && (
              <div className={styles.dialogTabs} role="tablist" aria-label="Atlas Ansicht">
                <button type="button" className={activeTab === 'frame' ? styles.activeDialogTab : ''} onClick={() => setActiveTab('frame')}>Frame</button>
                <button type="button" className={activeTab === 'atlas' ? styles.activeDialogTab : ''} onClick={() => setActiveTab('atlas')}>Atlas</button>
              </div>
            )}
            <button type="button" className={styles.headerButton} onClick={onClose}>Schließen</button>
          </div>
        </div>
        {showAtlasViewer ? (
          <div className={styles.atlasDialogBody}>
            <aside className={styles.frameList}>
              <div className={styles.frameListHeader}>{frames.length} Frames</div>
              {frames.map((frame) => (
                <button
                  key={frame.id}
                  type="button"
                  className={`${styles.frameListItem} ${frame.id === selectedFrame?.id ? styles.selectedFrameListItem : ''}`}
                  onClick={() => setSelectedFrameId(frame.id)}
                >
                  <FramePreview asset={frame} compact />
                  <span>{frame.frameKey ?? frame.id}</span>
                  <small>{frame.rect?.width}×{frame.rect?.height}</small>
                </button>
              ))}
            </aside>
            <section className={styles.atlasPreviewPanel}>
              {activeTab === 'frame' && selectedFrame ? (
                <div className={styles.dialogFramePreview}>
                  <FramePreview asset={selectedFrame} compact={false} />
                </div>
              ) : (
                <AtlasImageWithFrame atlas={atlasAsset} selectedFrame={selectedFrame} />
              )}
              {selectedFrame && (
                <div className={styles.dialogFrameMeta}>
                  <strong>{selectedFrame.frameKey ?? selectedFrame.id}</strong>
                  <span>{selectedFrame.rect ? `${selectedFrame.rect.x},${selectedFrame.rect.y} · ${selectedFrame.rect.width}×${selectedFrame.rect.height}` : 'Kein Rect'}</span>
                </div>
              )}
            </section>
          </div>
        ) : src ? (
          <img className={styles.originalAssetImage} src={src} alt={asset.id} />
        ) : <p className={styles.empty}>Keine URL vorhanden.</p>}
      </div>
    </div>
  );
}

function AtlasImageWithFrame({ atlas, selectedFrame }: { atlas?: DebugImageAssetDescriptor; selectedFrame?: DebugImageAssetDescriptor }) {
  if (!atlas?.url) return <p className={styles.empty}>Keine Atlas-URL vorhanden.</p>;
  const rect = selectedFrame?.rect;
  return (
    <div className={styles.atlasImageStage}>
      <div className={styles.atlasImageWrap}>
        <img className={styles.originalAssetImage} src={atlas.url} alt={atlas.id} />
        {rect && atlas.width > 0 && atlas.height > 0 && (
          <div
            className={styles.frameRectOverlay}
            style={{
              left: `${(rect.x / atlas.width) * 100}%`,
              top: `${(rect.y / atlas.height) * 100}%`,
              width: `${(rect.width / atlas.width) * 100}%`,
              height: `${(rect.height / atlas.height) * 100}%`,
            }}
          />
        )}
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
          {isTextNode(node) && <TypeIcon className={styles.nodeIcon} size={14} />}
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

function isTextNode(node: DebugNodeDescriptor): boolean {
  return node.className.toLowerCase().includes('textnode');
}

function Inspector({
  node,
  definition,
  debugProps,
  patchStatus,
  assets,
  onPatch,
  onSelectAsset,
}: {
  node: DebugNodeDescriptor;
  definition?: DebugSceneNodeDefinition;
  debugProps?: DebugNodePropsMessage;
  patchStatus: string;
  assets: DebugImageAssetDescriptor[];
  onPatch(node: DebugNodeDescriptor, props: DebugNodePatch): void;
  onSelectAsset(id: string): void;
}) {
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
      {node.guid && (
        <div>
          <label>GUID</label>
          <code>{node.guid}</code>
        </div>
      )}
      <ExposedPropsSection node={node} definition={definition} debugProps={debugProps} assets={assets} patchStatus={patchStatus} onPatch={onPatch} />
      <InspectorSection title="Debug · read-only">
        <FragmentRow name="index" value={node.index} />
        <FragmentRow name="children" value={node.children.length} />
        <FragmentRow name="worldBounds" value={formatBounds(debugProps?.worldBounds ?? debugProps?.bounds)} />
      </InspectorSection>
    </div>
  );
}

function ExposedPropsSection({
  node,
  definition,
  debugProps,
  assets,
  patchStatus,
  onPatch,
}: {
  node: DebugNodeDescriptor;
  definition?: DebugSceneNodeDefinition;
  debugProps?: DebugNodePropsMessage;
  assets: DebugImageAssetDescriptor[];
  patchStatus: string;
  onPatch(node: DebugNodeDescriptor, props: DebugNodePatch): void;
}) {
  const [localOverrides, setLocalOverrides] = useState<DebugNodePatch>({});
  const lastPatchSignatureRef = useRef<string>('');

  useEffect(() => {
    setLocalOverrides({});
    lastPatchSignatureRef.current = '';
  }, [node.id]);

  function patchProp(key: string, value: DebugNodePatch[string]): void {
    const patch: DebugNodePatch = { [key]: value };
    const signature = `${node.id}:${JSON.stringify(patch)}`;
    if (lastPatchSignatureRef.current === signature) return;
    lastPatchSignatureRef.current = signature;
    setLocalOverrides((current) => ({ ...current, [key]: value }));
    onPatch(node, patch);
  }

  const groups = definition?.exposedPropGroups ?? (definition?.editableProps ? [{ name: 'Exposed Props', props: definition.editableProps }] : undefined);

  return (
    <>
      {groups ? groups.map((group) => {
        const visibleProps = Object.entries(group.props);
        return (
        <InspectorSection key={group.name} title={group.name}>
          {visibleProps.map(([key, prop]) => (
            <EditablePropRow
              key={`${node.id}:${key}`}
              name={key}
              prop={prop}
              value={key in localOverrides ? localOverrides[key] : currentEditablePropValue(key, prop, node, debugProps)}
              assets={assets}
              onCommit={(value) => patchProp(key, value)}
            />
          ))}
        </InspectorSection>
        );
      }) : <InspectorSection title="Exposed Props"><FragmentRow name="status" value="Keine Node-Definition für diesen Node." /></InspectorSection>}
      {patchStatus && <InspectorSection title="Patch"><FragmentRow name="status" value={patchStatus} /></InspectorSection>}
    </>
  );
}

const inputCommitDebounceMs = 250;

function EditablePropRow({
  name,
  prop,
  value,
  assets,
  onCommit,
}: {
  name: string;
  prop: DebugScenePropDefinition;
  value: unknown;
  assets: DebugImageAssetDescriptor[];
  onCommit(value: DebugNodePatch[string]): void;
}) {
  const label = `${prop.label ?? name}${prop.readOnly ? ' · read-only' : ''}`;
  const [draft, setDraft] = useState<unknown>(value);
  const [editing, setEditing] = useState(false);
  const commitTimerRef = useRef<number | undefined>(undefined);
  const lastCommitSignatureRef = useRef<string>('');

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  useEffect(() => {
    lastCommitSignatureRef.current = '';
  }, [name]);

  useEffect(() => () => clearCommitTimer(), []);

  function clearCommitTimer(): void {
    if (commitTimerRef.current === undefined) return;
    window.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = undefined;
  }

  function scheduleCommit(nextValue: unknown): void {
    setEditing(true);
    setDraft(nextValue);
    clearCommitTimer();
    commitTimerRef.current = window.setTimeout(() => commit(nextValue, { keepEditing: true }), inputCommitDebounceMs);
  }

  function commit(nextValue = draft, options: { keepEditing?: boolean } = {}): void {
    if (prop.readOnly) return;
    const coerced = coerceEditableValue(prop, nextValue);
    if (coerced === undefined) return;
    const signature = JSON.stringify(coerced);
    if (lastCommitSignatureRef.current === signature) {
      clearCommitTimer();
      setDraft(coerced);
      setEditing(options.keepEditing === true);
      return;
    }
    lastCommitSignatureRef.current = signature;
    console.log('[Gravity Dig Debug][inspector]', 'commit', { name, prop, draft: nextValue, coerced });
    clearCommitTimer();
    setDraft(coerced);
    setEditing(options.keepEditing === true);
    onCommit(coerced);
  }

  function commitOnEnter(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      clearCommitTimer();
      commit();
      event.currentTarget.blur();
    }
  }

  if (prop.type === 'Boolean') {
    return (
      <>
        <span>{label}</span>
        <input className={styles.editorCheckbox} type="checkbox" checked={draft === true} disabled={prop.readOnly} onChange={(event) => commit(event.currentTarget.checked)} />
      </>
    );
  }

  if (prop.type === 'Number') {
    return (
      <>
        <span>{label}</span>
        <input className={styles.editorInput} type="number" value={numberInputValue(draft)} min={prop.min} max={prop.max} step={prop.step ?? 1} disabled={prop.readOnly} onFocus={() => setEditing(true)} onKeyDown={commitOnEnter} onChange={(event) => scheduleCommit(event.currentTarget.value)} onBlur={() => commit()} />
      </>
    );
  }

  if (prop.type === 'String') {
    return (
      <>
        <span>{label}</span>
        <input className={styles.editorInput} type="text" value={typeof draft === 'string' ? draft : ''} disabled={prop.readOnly} onFocus={() => setEditing(true)} onKeyDown={commitOnEnter} onChange={(event) => scheduleCommit(event.currentTarget.value)} onBlur={() => commit()} />
      </>
    );
  }

  if (prop.type === 'AssetId') {
    return (
      <>
        <span>{label}</span>
        <select className={styles.editorInput} value={typeof draft === 'string' ? draft : ''} disabled={prop.readOnly} onChange={(event) => commit(event.currentTarget.value)}>
          <option value="">Asset wählen</option>
          {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.id}</option>)}
        </select>
      </>
    );
  }

  if (prop.type === 'Anchor') {
    return (
      <>
        <span>{label}</span>
        <select className={styles.editorInput} value={typeof draft === 'string' ? draft : ''} disabled={prop.readOnly} onChange={(event) => commit(event.currentTarget.value)}>
          {(prop.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </>
    );
  }

  if (prop.type === 'Position' || prop.type === 'Origin' || prop.type === 'Scale') {
    const point = isPointValue(draft) ? draft : { x: 0, y: 0 };
    return (
      <>
        <span>{label}</span>
        <div className={styles.vectorEditor}>
          <input className={styles.editorInput} type="number" value={numberInputValue(point.x)} step={prop.step ?? (prop.type === 'Origin' || prop.type === 'Scale' ? 0.01 : 1)} min={prop.min} max={prop.max} disabled={prop.readOnly} onFocus={() => setEditing(true)} onKeyDown={commitOnEnter} onChange={(event) => scheduleCommit({ x: event.currentTarget.value, y: point.y })} onBlur={() => commit()} />
          <input className={styles.editorInput} type="number" value={numberInputValue(point.y)} step={prop.step ?? (prop.type === 'Origin' || prop.type === 'Scale' ? 0.01 : 1)} min={prop.min} max={prop.max} disabled={prop.readOnly} onFocus={() => setEditing(true)} onKeyDown={commitOnEnter} onChange={(event) => scheduleCommit({ x: point.x, y: event.currentTarget.value })} onBlur={() => commit()} />
        </div>
      </>
    );
  }

  if (prop.type === 'Size') {
    const size = isSizeValue(draft) ? draft : { width: 0, height: 0 };
    return (
      <>
        <span>{label}</span>
        <div className={styles.vectorEditor}>
          <input className={styles.editorInput} type="number" value={numberInputValue(size.width)} step={prop.step ?? 1} min={prop.min ?? 0} max={prop.max} disabled={prop.readOnly} onFocus={() => setEditing(true)} onKeyDown={commitOnEnter} onChange={(event) => scheduleCommit({ width: event.currentTarget.value, height: size.height })} onBlur={() => commit()} />
          <input className={styles.editorInput} type="number" value={numberInputValue(size.height)} step={prop.step ?? 1} min={prop.min ?? 0} max={prop.max} disabled={prop.readOnly} onFocus={() => setEditing(true)} onKeyDown={commitOnEnter} onChange={(event) => scheduleCommit({ width: size.width, height: event.currentTarget.value })} onBlur={() => commit()} />
        </div>
      </>
    );
  }

  return <FragmentRow name={label} value="Unsupported" />;
}

function coerceEditableValue(prop: DebugScenePropDefinition, value: unknown): DebugNodePatch[string] | undefined {
  if (prop.type === 'String' || prop.type === 'AssetId' || prop.type === 'Anchor') return typeof value === 'string' ? value : undefined;
  if (prop.type === 'Boolean') return typeof value === 'boolean' ? value : undefined;
  if (prop.type === 'Number') return parseFiniteNumber(value);
  if (prop.type === 'Position' || prop.type === 'Origin' || prop.type === 'Scale') {
    if (!isPointValue(value)) return undefined;
    const x = parseFiniteNumber(value.x);
    const y = parseFiniteNumber(value.y);
    return x === undefined || y === undefined ? undefined : { x, y };
  }
  if (prop.type === 'Size') {
    if (!isSizeValue(value)) return undefined;
    const width = parseFiniteNumber(value.width);
    const height = parseFiniteNumber(value.height);
    return width === undefined || height === undefined ? undefined : { width, height };
  }
  return undefined;
}

function parseFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function currentEditablePropValue(key: string, prop: DebugScenePropDefinition, node: DebugNodeDescriptor, debugProps?: DebugNodePropsMessage): unknown {
  const props = debugProps?.props;
  const local = debugProps?.localTransform;
  if (key === 'active') return node.active;
  if (key === 'visible') return node.visible;
  if (key === 'order') return node.order;
  if (key === 'position') return local ? { x: local.x, y: local.y } : undefined;
  if (key === 'size') return local ? { width: local.width, height: local.height } : undefined;
  if (key === 'origin') return local ? { x: local.originX, y: local.originY } : undefined;
  if (key === 'rotation') return local?.rotation;
  if (key === 'scaleX') return local?.scaleX;
  if (key === 'scaleY') return local?.scaleY;
  if (key === 'scale') return local ? { x: local.scaleX, y: local.scaleY } : undefined;
  if (prop.type === 'Anchor' || prop.type === 'AssetId' || prop.type === 'String' || prop.type === 'Number' || prop.type === 'Boolean') return props?.[key];
  return props?.[key];
}

function numberInputValue(value: unknown): string | number {
  if (typeof value === 'string') return value;
  return typeof value === 'number' && Number.isFinite(value) ? value : '';
}

function isDraftNumber(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string';
}

function isPointValue(value: unknown): value is { x: number | string; y: number | string } {
  return typeof value === 'object' && value !== null && isDraftNumber((value as { x: unknown }).x) && isDraftNumber((value as { y: unknown }).y);
}

function isSizeValue(value: unknown): value is { width: number | string; height: number | string } {
  return typeof value === 'object' && value !== null && isDraftNumber((value as { width: unknown }).width) && isDraftNumber((value as { height: unknown }).height);
}

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className={styles.inspectorSection}>
      <button type="button" className={styles.inspectorSectionHeader} onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{title}</span>
      </button>
      {open && <div className={styles.inspectorGrid}>{children}</div>}
    </section>
  );
}

function AssetLinkRow({ name, value, assetId, onSelectAsset }: { name: string; value: string | number | boolean | null; assetId?: string; onSelectAsset(id: string): void }) {
  return (
    <>
      <span>{name}</span>
      <strong className={styles.inlineValueWithAction}>
        <span>{value === null ? 'null' : String(value)}</span>
        {assetId && (
          <button type="button" className={styles.inlineIconButton} title="Im Asset Explorer auswählen" aria-label={`${assetId} im Asset Explorer auswählen`} onClick={() => onSelectAsset(assetId)}>
            <Search size={13} />
          </button>
        )}
      </strong>
    </>
  );
}


const exposedPropDuplicates = new Set([
  'active',
  'visible',
  'order',
  'sizeMode',
  'boundsMode',
  'debugScrollFactor',
  'parentAnchor',
  'localX',
  'localY',
  'localWidth',
  'localHeight',
  'originX',
  'originY',
  'rotation',
  'worldX',
  'worldY',
  'worldRotation',
  'contentX',
  'contentY',
  'contentWidth',
  'contentHeight',
  'assetId',
  'assetKind',
  'textureKey',
  'frameKey',
]);

function filteredExposedProps(props: Record<string, string | number | boolean | null>): [string, string | number | boolean | null][] {
  return Object.entries(props).filter(([key]) => !exposedPropDuplicates.has(key));
}

function TransformSection({ title, transform, editable = false }: { title: string; transform?: DebugNodeTransform; editable?: boolean }) {
  return (
    <InspectorSection title={`${title}${editable ? ' · editierbar' : ' · read-only'}`}>
      {transform ? (
        <>
          <FragmentRow name="x" value={formatNumber(transform.x)} />
          <FragmentRow name="y" value={formatNumber(transform.y)} />
          <FragmentRow name="width" value={formatNumber(transform.width)} />
          <FragmentRow name="height" value={formatNumber(transform.height)} />
          <FragmentRow name="originX" value={formatNumber(transform.originX, 3)} />
          <FragmentRow name="originY" value={formatNumber(transform.originY, 3)} />
          <FragmentRow name="rotation" value={`${formatNumber(radToDeg(transform.rotation), 2)}°`} />
          <FragmentRow name="scaleX" value={formatNumber(transform.scaleX, 3)} />
          <FragmentRow name="scaleY" value={formatNumber(transform.scaleY, 3)} />
        </>
      ) : <FragmentRow name="status" value="Warte auf Transform-Daten..." />}
    </InspectorSection>
  );
}

function BoundsSection({ bounds }: { bounds?: DebugNodeBounds }) {
  return (
    <InspectorSection title="World Bounds · read-only">
      {bounds ? (
        <>
          <FragmentRow name="x" value={formatNumber(bounds.x)} />
          <FragmentRow name="y" value={formatNumber(bounds.y)} />
          <FragmentRow name="width" value={formatNumber(bounds.width)} />
          <FragmentRow name="height" value={formatNumber(bounds.height)} />
          {bounds.corners && <FragmentRow name="corners" value={bounds.corners.map((corner) => `${formatNumber(corner.x)},${formatNumber(corner.y)}`).join(' · ')} />}
        </>
      ) : <FragmentRow name="status" value="Keine Bounds exposed" />}
    </InspectorSection>
  );
}

function formatBounds(bounds?: DebugNodeBounds): string {
  if (!bounds) return 'Keine Bounds exposed';
  return `${formatNumber(bounds.x)},${formatNumber(bounds.y)} ${formatNumber(bounds.width)}×${formatNumber(bounds.height)}`;
}

function formatNumber(value: number, fractionDigits = 1): string {
  if (!Number.isFinite(value)) return String(value);
  return Number.isInteger(value) ? String(value) : value.toFixed(fractionDigits);
}

function radToDeg(radians: number): number {
  return radians * 180 / Math.PI;
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
