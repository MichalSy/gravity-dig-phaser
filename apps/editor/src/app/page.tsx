'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { Box, Boxes, ChevronDown, ChevronRight, Code2, Crosshair, ExternalLink, Eye, EyeOff, File as FileIcon, Folder, FolderOpen, Frame, Gamepad2, Image as ImageIcon, Layers, MousePointer2, Power, PowerOff, RefreshCw, RotateCcw, Search, Square, Type as TypeIcon } from 'lucide-react';
import type { DebugImageAnimationDescriptor, DebugImageAssetDescriptor, DebugMessage, DebugNodeBounds, DebugNodeDelta, DebugNodeDescriptor, DebugNodePatch, DebugNodePropsMessage, DebugNodeTransform, DebugOverlayLayerDescriptor, DebugSceneNodeDefinition, DebugScenePropDefinition, EditorChangeSet, EditorSetPropsChange } from '@gravity-dig/debug-protocol';
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

function editorApi(path: string): string {
  const apiPath = `/api/editor${path}`;
  if (typeof window === 'undefined') return apiPath;
  return new URL(apiPath, window.location.origin).toString();
}

function buildDebugGameUrl(sessionId: string): string {
  const url = new URL(defaultGameUrl());
  url.searchParams.set('debug', '1');
  url.searchParams.set('debugSession', sessionId);
  url.searchParams.set('debugRelay', defaultRelayUrl());
  if (typeof window !== 'undefined') url.searchParams.set('debugEditorApi', window.location.origin);
  return url.toString();
}

const layoutStorageKey = 'gravity-dig-debug-editor-layout-v1';
const dynamicNodeDragMimeType = 'application/x-gravity-dig-dynamic-node';
const maxConcurrentThumbnailLoads = 5;
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

interface ThumbnailQueueTask {
  url: string;
  controller: AbortController;
  started: boolean;
  done: boolean;
  onLoad(blob: Blob): void;
  onError(error: unknown): void;
}

const thumbnailQueue: ThumbnailQueueTask[] = [];
let activeThumbnailLoads = 0;

interface EditorLayoutState {
  hierarchyWidth: number;
  inspectorWidth: number;
  assetExplorerHeight: number;
  assetSplitPercent: number;
  folderTreeWidth: number;
}

interface DynamicNodeManifestEntry {
  nodeTypeId?: string;
  source: string;
  url: string;
  hash: string;
}

interface DynamicNodeManifest {
  version: 1;
  nodes: DynamicNodeManifestEntry[];
}

interface EditorGitStatus {
  ok: boolean;
  branch: string;
  head: string;
  originHead?: string;
  status: string[];
  ahead?: number;
  behind?: number;
  needsRebase?: boolean;
}

interface PublicFileEntry {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  size?: number;
  modifiedAt?: number;
  extension?: string;
  children?: PublicFileEntry[];
}

interface PublicAtlasFrame {
  id: string;
  label: string;
  rect: { x: number; y: number; width: number; height: number };
}

interface NodeSourceFileContent {
  path: string;
  content: string;
  modifiedAt: number;
  size: number;
}

const defaultLayoutState: EditorLayoutState = {
  hierarchyWidth: 448,
  inspectorWidth: 340,
  assetExplorerHeight: 380,
  assetSplitPercent: 58,
  folderTreeWidth: 240,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function enqueueThumbnailLoad(url: string, onLoad: (blob: Blob) => void, onError: (error: unknown) => void): { abort(): void } {
  const task: ThumbnailQueueTask = { url, controller: new AbortController(), started: false, done: false, onLoad, onError };
  thumbnailQueue.push(task);
  pumpThumbnailQueue();
  return {
    abort() {
      if (task.done) return;
      task.done = true;
      task.controller.abort();
      const index = thumbnailQueue.indexOf(task);
      if (index >= 0) thumbnailQueue.splice(index, 1);
      pumpThumbnailQueue();
    },
  };
}

function pumpThumbnailQueue(): void {
  while (activeThumbnailLoads < maxConcurrentThumbnailLoads) {
    const task = thumbnailQueue.find((candidate) => !candidate.started && !candidate.done);
    if (!task) return;
    task.started = true;
    activeThumbnailLoads += 1;
    void fetch(task.url, { cache: 'force-cache', signal: task.controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Thumbnail HTTP ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (!task.done) task.onLoad(blob);
      })
      .catch((error) => {
        if (!task.done && !(error instanceof DOMException && error.name === 'AbortError')) task.onError(error);
      })
      .finally(() => {
        task.done = true;
        activeThumbnailLoads = Math.max(0, activeThumbnailLoads - 1);
        const index = thumbnailQueue.indexOf(task);
        if (index >= 0) thumbnailQueue.splice(index, 1);
        pumpThumbnailQueue();
      });
  }
}

function countPendingProps(changeSet: EditorChangeSet): number {
  return pendingChangeRows(changeSet).length;
}

type PendingChangeRow = {
  change: EditorSetPropsChange;
  prop: string;
  field?: string;
  label: string;
  value: unknown;
};

function pendingChangeRows(changeSet: EditorChangeSet): PendingChangeRow[] {
  return changeSet.changes.flatMap((change) => Object.entries(change.props).map(([prop, value]) => {
    const field = singleFieldName(change);
    return { change, prop, field, label: field ? `${prop}.${field}` : prop, value: field ? fieldValue(value, field) : value };
  }));
}

function singleFieldName(change: EditorSetPropsChange): string | undefined {
  return change.fieldPath?.length === 1 ? change.fieldPath[0] : undefined;
}

function fieldValue(value: unknown, field: string): unknown {
  return isObjectRecord(value) ? value[field] : undefined;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatPendingValue(value: unknown): string {
  if (value === null) return 'delete';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function applyLayoutToDocument(layout: EditorLayoutState): void {
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;
  style.setProperty('--hierarchy-width', `${layout.hierarchyWidth}px`);
  style.setProperty('--inspector-width', `${layout.inspectorWidth}px`);
  style.setProperty('--asset-explorer-height', `${layout.assetExplorerHeight}px`);
  style.setProperty('--asset-list-fr', `${layout.assetSplitPercent}fr`);
  style.setProperty('--asset-detail-fr', `${100 - layout.assetSplitPercent}fr`);
  style.setProperty('--folder-tree-width', `${layout.folderTreeWidth}px`);
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
      folderTreeWidth: clamp(parsed.folderTreeWidth ?? defaultLayoutState.folderTreeWidth, 150, 420),
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
  const [persistentManagersOpen, setPersistentManagersOpen] = useState(false);
  const [selectedNodeProps, setSelectedNodeProps] = useState<DebugNodePropsMessage | undefined>();
  const [overlayLayerSelections, setOverlayLayerSelections] = useState<Record<string, string[]>>({});
  const [nodeDefinitions, setNodeDefinitions] = useState<Map<string, DebugSceneNodeDefinition>>(() => new Map());
  const [patchStatus, setPatchStatus] = useState('');
  const [pendingChangeCount, setPendingChangeCount] = useState(0);
  const [pendingChangeSet, setPendingChangeSet] = useState<EditorChangeSet | undefined>();
  const [savePreviewOpen, setSavePreviewOpen] = useState(false);
  const [gitSaveStatus, setGitSaveStatus] = useState('');
  const [gitNeedsRebase, setGitNeedsRebase] = useState(false);
  const [inspectorResetVersion, setInspectorResetVersion] = useState(0);
  const [imageAssets, setImageAssets] = useState<DebugImageAssetDescriptor[]>([]);
  const [animations, setAnimations] = useState<DebugImageAnimationDescriptor[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>();
  const [originalAssetId, setOriginalAssetId] = useState<string | undefined>();
  const [publicFileRoot, setPublicFileRoot] = useState<PublicFileEntry | undefined>();
  const [nodeFileRoot, setNodeFileRoot] = useState<PublicFileEntry | undefined>();
  const [selectedPublicDirectoryPath, setSelectedPublicDirectoryPath] = useState('apps/game/public');
  const [selectedPublicFilePath, setSelectedPublicFilePath] = useState<string | undefined>();
  const [previewPublicFilePath, setPreviewPublicFilePath] = useState<string | undefined>();
  const [openNodeFilePath, setOpenNodeFilePath] = useState<string | undefined>();
  const [expandedPublicDirectoryPaths, setExpandedPublicDirectoryPaths] = useState<Set<string>>(() => new Set(['apps/game/public', 'apps/game/src']));
  const [publicFileStatus, setPublicFileStatus] = useState('Lade public/ ...');
  const [lastEvent, setLastEvent] = useState('Warte auf Game...');
  const [bridgeBinding, setBridgeBinding] = useState('Bridge nicht gebunden');
  const [gameFrameKey, setGameFrameKey] = useState(0);
  const [layout, setLayout] = useState<EditorLayoutState>(() => readStoredLayout());
  const reconnectTimerRef = useRef<number | undefined>(undefined);
  const socketRef = useRef<WebSocket | null>(null);
  const editorClientIdRef = useRef<string>(createSessionId());
  const boundGameClientIdRef = useRef<string | undefined>(undefined);
  const dynamicNodeManifestRef = useRef<DynamicNodeManifest | undefined>(undefined);
  const lastSelectMessageRef = useRef<string>('');
  const selectedNodeIdRef = useRef<string | undefined>(undefined);
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
  const explorerRoots = useMemo(() => [publicFileRoot, nodeFileRoot].filter((root): root is PublicFileEntry => Boolean(root)), [publicFileRoot, nodeFileRoot]);
  const selectedPublicDirectory = useMemo(
    () => findPublicDirectoryInRoots(explorerRoots, selectedPublicDirectoryPath) ?? publicFileRoot ?? nodeFileRoot,
    [explorerRoots, nodeFileRoot, publicFileRoot, selectedPublicDirectoryPath],
  );
  const publicFilesInSelectedDirectory = useMemo(
    () => selectedPublicDirectory?.children?.filter((entry) => entry.kind === 'file') ?? [],
    [selectedPublicDirectory],
  );
  const selectedPublicFile = useMemo(
    () => selectedPublicFilePath ? findPublicFileInRoots(explorerRoots, selectedPublicFilePath) : undefined,
    [explorerRoots, selectedPublicFilePath],
  );
  const publicFileCount = useMemo(
    () => explorerRoots.reduce((total, root) => total + countPublicFiles(root), 0),
    [explorerRoots],
  );
  const selectedNodeDefinition = useMemo(
    () => (selectedNode?.instanceId ? nodeDefinitions.get(selectedNode.instanceId) : selectedNode ? nodeDefinitions.get(selectedNode.id) : undefined),
    [nodeDefinitions, selectedNode],
  );
  const selectedNodeHasInactiveParent = useMemo(
    () => selectedNode ? hasInactiveAncestor(treeRoots, selectedNode) : false,
    [selectedNode, treeRoots],
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
        const hello: DebugMessage = { type: 'hello', role: 'editor', sessionId, clientId: editorClientIdRef.current };
        console.log('[Gravity Dig Debug][editor->game]', hello.type, hello);
        socket.send(JSON.stringify(hello));
        setStatus('connected');
        setBridgeBinding('Bridge wartet auf Game-Bindung');
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
        if (message.games > 0) {
          requestBridgeBinding();
          setLastEvent('Game verbunden. Bridge-Bindung angefragt.');
        }
        return;
      }

      if (message.type === 'bridge:bind-ack') {
        boundGameClientIdRef.current = message.gameClientId;
        setBridgeBinding('Bridge 1:1 gebunden');
        setLastEvent('Game und Editor sind 1:1 gebunden.');
        return;
      }

      if (message.type === 'bridge:bind-rejected') {
        boundGameClientIdRef.current = undefined;
        setBridgeBinding(`Bridge abgelehnt: ${message.reason}`);
        setLastEvent(`Bridge abgelehnt: ${message.reason}`);
        return;
      }

      if (message.type === 'dynamic-node:module-request') {
        void respondToDynamicNodeModuleRequest(message);
        return;
      }

      if (message.type === 'node:create:ack') {
        setPatchStatus(message.applied ? `Node injected: ${message.name ?? message.nodeId ?? message.requestId}` : `Node Injection abgelehnt: ${message.rejected ?? 'Unbekannter Fehler'}`);
        return;
      }

      if (message.type === 'node:definitions') {
        setNodeDefinitions(new Map(message.nodes.map((node) => [node.instanceId, node])));
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
        if (message.nodeId === selectedNodeIdRef.current) setSelectedNodeProps(message);
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
    void refreshPendingChanges();
    void refreshGitStatus();
  }, [sessionId]);

  useEffect(() => {
    void refreshPublicFiles();
  }, []);

  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  useEffect(() => {
    if (publicFilesInSelectedDirectory.length === 0) {
      setSelectedPublicFilePath(undefined);
      return;
    }
    setSelectedPublicFilePath((current) => current && publicFilesInSelectedDirectory.some((file) => file.path === current) ? current : publicFilesInSelectedDirectory[0]?.path);
  }, [publicFilesInSelectedDirectory]);

  useEffect(() => {
    setSelectedNodeProps(undefined);
    if (!selectedNodeId || !sessionId || socketRef.current?.readyState !== WebSocket.OPEN) return;
    const selectSignature = `${sessionId}:${selectedNodeId}`;
    if (lastSelectMessageRef.current === selectSignature) return;
    lastSelectMessageRef.current = selectSignature;
    const selectMessage: DebugMessage = { type: 'node:select', sessionId, nodeId: selectedNodeId, sentAt: Date.now() };
    socketRef.current.send(JSON.stringify(selectMessage));
  }, [selectedNodeId, sessionId]);

  useEffect(() => {
    if (!selectedNodeId || !sessionId || socketRef.current?.readyState !== WebSocket.OPEN) return;
    const definition = selectedNodeDefinition;
    const defaultLayerIds = definition?.overlayLayers.map((layer) => layer.id) ?? [];
    const enabledLayerIds = overlayLayerSelections[selectedNodeId] ?? defaultLayerIds;
    const message: DebugMessage = { type: 'debug:overlay-settings', sessionId, nodeId: selectedNodeId, enabledLayerIds, sentAt: Date.now() };
    socketRef.current.send(JSON.stringify(message));
  }, [overlayLayerSelections, selectedNodeDefinition, selectedNodeId, sessionId]);

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
    setPersistentManagersOpen(false);
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
    setPersistentManagersOpen(true);
    setExpandedNodeIds(new Set(collectNodeIds(treeRoots)));
  }

  function collapseAllNodes(): void {
    setPersistentManagersOpen(false);
    setExpandedNodeIds(new Set());
  }

  async function refreshPendingChanges(): Promise<void> {
    if (!sessionId) return;
    try {
      const response = await fetch(editorApi(`/changes/${encodeURIComponent(sessionId)}`), { cache: 'no-store' });
      const changeSet = await response.json() as EditorChangeSet;
      setPendingChangeSet(changeSet);
      setPendingChangeCount(countPendingProps(changeSet));
    } catch (error) {
      setGitSaveStatus(`Pending Changes konnten nicht geladen werden: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function refreshGitStatus(): Promise<void> {
    try {
      const response = await fetch(editorApi('/git/status'));
      const status = await response.json() as EditorGitStatus;
      if (!response.ok || !status.ok) throw new Error(`HTTP ${response.status}`);
      setGitNeedsRebase(status.needsRebase === true);
    } catch {
      setGitNeedsRebase(false);
    }
  }

  async function refreshPublicFiles(): Promise<void> {
    setPublicFileStatus('Lade Assets + Nodes ...');
    try {
      dynamicNodeManifestRef.current = undefined;
      const [publicResult, nodeResult] = await Promise.all([fetchPublicFileTree(), fetchNodeFileTree()]);
      const roots = [publicResult.root, nodeResult.root];
      setPublicFileRoot(publicResult.root);
      setNodeFileRoot(nodeResult.root);
      setSelectedPublicDirectoryPath((current) => findPublicDirectoryInRoots(roots, current) ? current : publicResult.root.path);
      setExpandedPublicDirectoryPaths((current) => new Set([publicResult.root.path, nodeResult.root.path, ...current].filter((path) => findPublicDirectoryInRoots(roots, path))));
      setPublicFileStatus('Assets + Nodes geladen');
    } catch (error) {
      setPublicFileStatus(`Assets/Nodes konnten nicht geladen werden: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function fetchPublicFileTree(): Promise<{ root: PublicFileEntry }> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(editorApi(`/public-files?ts=${Date.now()}`), {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        const text = await response.text();
        const contentType = response.headers.get('content-type') ?? '';
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
        if (!contentType.includes('application/json')) throw new Error(`Erwartete JSON, bekam ${contentType || 'unbekannten Content-Type'}: ${text.slice(0, 120)}`);
        const result = JSON.parse(text) as { root?: PublicFileEntry; error?: string };
        if (!result.root) throw new Error(result.error ?? 'Public-Tree fehlt in API-Antwort.');
        return { root: result.root };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        await delay(350 * attempt);
      }
    }
    throw lastError ?? new Error('Public-Tree konnte nicht geladen werden.');
  }

  async function fetchNodeFileTree(): Promise<{ root: PublicFileEntry }> {
    const response = await fetch(editorApi(`/node-files?ts=${Date.now()}`), {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const result = await response.json() as { root?: PublicFileEntry; error?: string };
    if (!response.ok || !result.root) throw new Error(result.error ?? `HTTP ${response.status}`);
    return { root: result.root };
  }

  function selectPublicDirectory(path: string): void {
    setSelectedPublicDirectoryPath(path);
    setExpandedPublicDirectoryPaths((current) => new Set([...current, ...publicDirectoryAncestorPaths(path), path]));
  }

  function togglePublicDirectory(path: string): void {
    setExpandedPublicDirectoryPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function openSavePreview(): Promise<void> {
    await refreshPendingChanges();
    setSavePreviewOpen(true);
  }

  async function savePendingChanges(): Promise<void> {
    if (!sessionId) return;
    setSavePreviewOpen(false);
    setGitSaveStatus(gitNeedsRebase ? 'Rebase + Git Save läuft...' : 'Speichere Änderungen nach Git...');
    try {
      const response = await fetch(editorApi(`/git/save/${encodeURIComponent(sessionId)}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `editor: save ${pendingChangeCount} pending change${pendingChangeCount === 1 ? '' : 's'}` }),
      });
      const result = await response.json() as { ok: boolean; commit?: string; message?: string; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      setPendingChangeSet(undefined);
      setPendingChangeCount(0);
      setGitNeedsRebase(false);
      setGitSaveStatus(result.commit ? `Gespeichert: Commit ${result.commit}` : result.message ?? 'Keine Änderungen zu speichern.');
      void refreshGitStatus();
    } catch (error) {
      setGitSaveStatus(`Git Save fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
      void refreshGitStatus();
    }
  }

  async function clearPendingChanges(): Promise<void> {
    if (!sessionId) return;
    setInspectorResetVersion((current) => current + 1);
    const changeSet = pendingChangeSet ?? await fetchPendingChangeSet();
    const reverted = revertPendingChanges(changeSet?.changes ?? []);
    if (reverted.failed > 0) {
      setGitSaveStatus(`Pending Changes nicht verworfen: ${reverted.failed} Revert-Patch(es) konnten nicht gesendet werden.`);
      return;
    }
    const response = await fetch(editorApi(`/changes/${encodeURIComponent(sessionId)}`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    const result = await response.json().catch(() => undefined) as { ok?: boolean; error?: string } | undefined;
    if (!response.ok || result?.ok === false) throw new Error(result?.error ?? `HTTP ${response.status}`);
    setPendingChangeSet(undefined);
    setPendingChangeCount(0);
    setSavePreviewOpen(false);
    setGitSaveStatus(reverted.skipped > 0 ? `Pending Changes verworfen. ${reverted.applied} Setting(s) zurückgesetzt, ${reverted.skipped} ohne alten Wert/Node übersprungen.` : `Pending Changes verworfen. ${reverted.applied} Setting(s) zurückgesetzt.`);
  }

  async function fetchPendingChangeSet(): Promise<EditorChangeSet | undefined> {
    if (!sessionId) return undefined;
    const response = await fetch(editorApi(`/changes/${encodeURIComponent(sessionId)}`), { cache: 'no-store' });
    if (!response.ok) return undefined;
    return await response.json() as EditorChangeSet;
  }

  function revertPendingChanges(changes: EditorSetPropsChange[]): { applied: number; skipped: number; failed: number } {
    let applied = 0;
    let skipped = 0;
    let failed = 0;
    const grouped = new Map<string, { target: DebugNodeDescriptor; props: DebugNodePatch; count: number }>();

    for (const change of changes) {
      const target = findNodeByPath(treeRoots, change.target.nodePath);
      if (!target) {
        skipped += Object.keys(change.props).length;
        continue;
      }
      const key = change.target.nodePath.join('\u0000');
      const group = grouped.get(key) ?? { target, props: {}, count: 0 };
      const revertProps = buildRevertProps(change, target, false);
      if (Object.keys(revertProps).length === 0) {
        skipped += Object.keys(change.props).length;
        continue;
      }
      for (const [prop, value] of Object.entries(revertProps)) group.props[prop] = value;
      group.count += Object.keys(revertProps).length;
      grouped.set(key, group);
    }

    for (const group of grouped.values()) {
      if (sendNodePatchMessage(group.target, group.props, false)) applied += group.count;
      else failed += group.count;
    }
    if (applied > 0) setPatchStatus(`Revert angewendet: ${applied} Setting(s)`);
    return { applied, skipped, failed };
  }

  async function removePendingSetting(change: EditorSetPropsChange, prop: string, field?: string): Promise<void> {
    if (!sessionId) return;
    const target = findNodeByPath(treeRoots, change.target.nodePath);
    const label = field ? `${prop}.${field}` : prop;
    if (!target) {
      setGitSaveStatus(`Setting '${label}' nicht entfernt: Node in Hierarchy nicht gefunden.`);
      return;
    }
    const revertProps = buildRevertProps(change, target, true);
    if (Object.keys(revertProps).length === 0) {
      setGitSaveStatus(`Setting '${label}' nicht entfernt: alter Wert fehlt, Revert wäre unsicher.`);
      return;
    }
    if (!sendNodePatchMessage(target, revertProps, false)) {
      setGitSaveStatus(`Setting '${label}' nicht entfernt: Revert-Patch konnte nicht gesendet werden.`);
      return;
    }
    const removeUrl = editorApi(`/changes/${encodeURIComponent(sessionId)}?${new URLSearchParams({ changeId: change.id, prop }).toString()}`);
    const response = await fetch(removeUrl, { method: 'DELETE', cache: 'no-store' });
    const result = await response.json() as { ok: boolean; changeSet?: EditorChangeSet; error?: string };
    if (!response.ok || !result.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
    const nextChangeSet = result.changeSet ?? { sessionId, changes: [] };
    const nextCount = countPendingProps(nextChangeSet);
    setPendingChangeSet(nextChangeSet);
    setPendingChangeCount(nextCount);
    setInspectorResetVersion((current) => current + 1);
    setGitSaveStatus(`Setting '${label}' entfernt und zurückgesetzt.`);
  }

  function buildRevertProps(change: EditorSetPropsChange, target: DebugNodeDescriptor, preferLiveBase: boolean): DebugNodePatch {
    return Object.fromEntries(Object.entries(change.props).flatMap(([prop, value]) => {
      const previousValue = change.previousProps?.[prop];
      if (!(prop in (change.previousProps ?? {}))) return [];
      const field = singleFieldName(change);
      if (!field) return [[prop, previousValue as DebugNodePatch[string]]];
      if (!isObjectRecord(previousValue)) return [];
      const base = preferLiveBase ? currentPatchValue(prop, target) : undefined;
      const objectBase = isObjectRecord(base) ? base : isObjectRecord(value) ? value : previousValue;
      return [[prop, { ...objectBase, [field]: (previousValue as Record<string, unknown>)[field] } as DebugNodePatch[string]]];
    })) as DebugNodePatch;
  }

  function currentPatchValue(prop: string, node: DebugNodeDescriptor): unknown {
    const debugProps = selectedNodeProps?.nodeId === node.id ? selectedNodeProps : undefined;
    const local = debugProps?.localTransform;
    if (prop === 'active') return node.active;
    if (prop === 'visible') return node.visible;
    if (prop === 'position') return local ? { x: local.x, y: local.y } : undefined;
    if (prop === 'size') return local ? { width: local.width, height: local.height } : undefined;
    if (prop === 'origin') return local ? { x: local.originX, y: local.originY } : undefined;
    if (prop === 'rotation') return local?.rotation;
    if (prop === 'scale') return local ? { x: local.scaleX, y: local.scaleY } : undefined;
    return debugProps?.props[prop];
  }

  function setNodeOverlayLayerEnabled(node: DebugNodeDescriptor, layerIds: string[]): void {
    setOverlayLayerSelections((current) => ({ ...current, [node.id]: layerIds }));
  }

  function sendNodePatch(node: DebugNodeDescriptor, props: DebugNodePatch): void {
    const previousProps = collectPreviousProps(node, props);
    if (!sendNodePatchMessage(node, props, true)) return;
    void persistPendingPatch(node, props, previousProps);
  }

  function sendNodePatchMessage(node: DebugNodeDescriptor, props: DebugNodePatch, showStatus: boolean): boolean {
    if (!sessionId || socketRef.current?.readyState !== WebSocket.OPEN) {
      if (showStatus) setPatchStatus('Patch nicht gesendet: Relay nicht verbunden.');
      return false;
    }

    const message: DebugMessage = { type: 'node:patch', sessionId, nodeId: node.id, instanceId: node.instanceId, name: node.name, props, sentAt: Date.now() };
    if (shouldLogDebugMessage(message.type)) console.log('[Gravity Dig Debug][editor->game]', message.type, message);
    socketRef.current.send(JSON.stringify(message));
    if (showStatus) setPatchStatus(`Patch gesendet: ${Object.keys(props).join(', ')}`);
    return true;
  }

  function requestBridgeBinding(force = false): void {
    if (!sessionId || socketRef.current?.readyState !== WebSocket.OPEN) return;
    const message: DebugMessage = {
      type: 'bridge:bind-request',
      sessionId,
      editorClientId: editorClientIdRef.current,
      force,
      sentAt: Date.now(),
    };
    socketRef.current.send(JSON.stringify(message));
    setBridgeBinding(force ? 'Bridge übernimmt Bindung ...' : 'Bridge-Bindung angefragt ...');
  }

  async function respondToDynamicNodeModuleRequest(message: Extract<DebugMessage, { type: 'dynamic-node:module-request' }>): Promise<void> {
    if (!sessionId || socketRef.current?.readyState !== WebSocket.OPEN) return;
    try {
      const code = await readPublicTextFile(compiledPathForDynamicModule(message.module));
      const response: DebugMessage = {
        type: 'dynamic-node:module-response',
        sessionId,
        targetClientId: message.sourceClientId,
        requestId: message.requestId,
        module: message.module,
        code,
        sentAt: Date.now(),
      };
      socketRef.current.send(JSON.stringify(response));
      setLastEvent(`Dynamic Node Modul gesendet: ${message.module.nodeTypeId}`);
    } catch (error) {
      const response: DebugMessage = {
        type: 'dynamic-node:module-error',
        sessionId,
        targetClientId: message.sourceClientId,
        requestId: message.requestId,
        module: message.module,
        error: error instanceof Error ? error.message : String(error),
        sentAt: Date.now(),
      };
      socketRef.current.send(JSON.stringify(response));
    }
  }

  async function injectDynamicNode(parentNode: DebugNodeDescriptor, file: PublicFileEntry): Promise<void> {
    if (!sessionId || socketRef.current?.readyState !== WebSocket.OPEN) {
      setPatchStatus('Node Injection nicht gesendet: Relay nicht verbunden.');
      return;
    }
    if (!boundGameClientIdRef.current) {
      requestBridgeBinding();
      setPatchStatus('Node Injection wartet: Bridge ist noch nicht 1:1 gebunden.');
      return;
    }

    const entry = await dynamicNodeManifestEntryForFile(file);
    if (!entry?.nodeTypeId) {
      setPatchStatus(`Keine Dynamic-Node-Manifest-Zuordnung für ${file.name}.`);
      return;
    }

    const requestId = createSessionId();
    const message: DebugMessage = {
      type: 'node:create',
      sessionId,
      targetClientId: boundGameClientIdRef.current,
      requestId,
      parentNodeId: parentNode.id,
      definition: {
        nodeTypeId: entry.nodeTypeId,
        name: defaultDynamicNodeName(entry),
        props: {},
      },
      module: {
        nodeTypeId: entry.nodeTypeId,
        source: entry.source,
        url: entry.url,
        hash: entry.hash,
      },
      sentAt: Date.now(),
    };
    socketRef.current.send(JSON.stringify(message));
    setSelectedNodeId(parentNode.id);
    setExpandedNodeIds((current) => new Set([...current, parentNode.id]));
    setPatchStatus(`Node Injection gesendet: ${entry.nodeTypeId} → ${parentNode.name}`);
  }

  async function dynamicNodeManifestEntryForFile(file: PublicFileEntry): Promise<DynamicNodeManifestEntry | undefined> {
    const manifest = dynamicNodeManifestRef.current ?? await loadDynamicNodeManifest();
    dynamicNodeManifestRef.current = manifest;
    const normalizedFilePath = file.path.replace(/^apps\/game\//, '');
    return manifest.nodes.find((entry) => entry.source === normalizedFilePath || `apps/game/${entry.source}` === file.path);
  }

  async function loadDynamicNodeManifest(): Promise<DynamicNodeManifest> {
    const text = await readPublicTextFile('apps/game/public/dynamic-nodes-compiled/manifest.json');
    return JSON.parse(text) as DynamicNodeManifest;
  }

  async function readPublicTextFile(path: string): Promise<string> {
    const response = await fetch(publicFileContentPathUrl(path), { cache: 'no-store', headers: { Accept: 'text/plain, application/javascript, application/json' } });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
    return text;
  }

  function collectPreviousProps(node: DebugNodeDescriptor, props: DebugNodePatch): DebugNodePatch {
    const definition = node.instanceId ? nodeDefinitions.get(node.instanceId) : undefined;
    const exposedProps = flattenDefinitionProps(definition);
    const debugProps = selectedNodeProps?.nodeId === node.id ? selectedNodeProps : undefined;
    return Object.fromEntries(Object.keys(props).flatMap((key) => {
      const prop = exposedProps[key];
      if (!prop) return [];
      const value = coerceEditableValue(prop, currentEditablePropValue(key, prop, node, debugProps));
      return value === undefined ? [] : [[key, value]];
    })) as DebugNodePatch;
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
    const panelHeight = workbenchRef.current?.getBoundingClientRect().height ?? window.innerHeight;
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

  function startFolderTreeResize(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const shield = createResizeShield('col-resize');
    const bodyRect = assetExplorerBodyRef.current?.getBoundingClientRect();
    if (!bodyRect) {
      shield?.remove();
      return;
    }
    const startX = event.clientX;
    const startWidth = readStoredLayout().folderTreeWidth;
    const maxWidth = Math.min(520, Math.max(180, bodyRect.width - 620));

    function onPointerMove(moveEvent: PointerEvent): void {
      setLayout((current) => {
        const next = { ...current, folderTreeWidth: clamp(startWidth + moveEvent.clientX - startX, 150, maxWidth) };
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

  async function persistPendingPatch(node: DebugNodeDescriptor, props: DebugNodePatch, previousProps: DebugNodePatch): Promise<void> {
    const nodePath = findNodePath(treeRoots, node.id);
    if (!nodePath) {
      setGitSaveStatus('Pending Change nicht gespeichert: Node-Pfad nicht gefunden.');
      return;
    }
    try {
      const response = await fetch(editorApi(`/changes/${encodeURIComponent(sessionId)}`), {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'setProps', target: { nodePath }, props, previousProps }),
      });
      const result = await response.json() as { ok: boolean; changeSet?: EditorChangeSet; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      setPendingChangeSet(result.changeSet);
      setPendingChangeCount(result.changeSet ? countPendingProps(result.changeSet) : 0);
      setGitSaveStatus(`Pending Change gespeichert: ${nodePath.join(' / ')}`);
      void refreshGitStatus();
    } catch (error) {
      setGitSaveStatus(`Pending Change fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const statusText = status === 'connected' ? 'Relay verbunden' : status === 'connecting' ? 'Verbinde...' : 'Getrennt';
  const gameText = gameCount > 0 ? 'Game verbunden' : 'Game lädt...';
  const editorTitle = gitNeedsRebase ? 'Debug Editor · Rebase nötig' : 'Debug Editor';

  return (
    <main className={styles.appShell}>
      <header className={styles.toolbar}>
        <div className={styles.brandBlock}>
          <span className={styles.eyebrow}>Gravity Dig</span>
          <h1 className={styles.title}>{editorTitle}</h1>
        </div>
        <div className={styles.statusStack}>
          <span className={`${styles.badge} ${styles[status]}`}>{statusText}</span>
          <span className={`${styles.badge} ${gameCount > 0 ? styles.connected : styles.connecting}`}>{gameText}</span>
        </div>
        <div className={styles.actions}>
          <button className={styles.button} onClick={reloadGameFrame} title="Game mit aktuellem Live-Stand neu laden">
            <RotateCcw size={16} /> Game neu laden
          </button>
          <button className={styles.button} onClick={openSavePreview} disabled={pendingChangeCount === 0} title={gitNeedsRebase ? 'Remote ist voraus: Save führt nach Review erst Rebase aus.' : (gitSaveStatus || 'Pending Changes prüfen und speichern')}>
            Git speichern ({pendingChangeCount})
          </button>
          <button className={`${styles.button} ${styles.ghost}`} onPointerDown={(event) => event.preventDefault()} onClick={clearPendingChanges} disabled={pendingChangeCount === 0}>
            Pending verwerfen
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
          <PanelHeader title="Hierarchy" meta={`${countNodes(treeRoots)} Nodes · ${bridgeBinding}`}>
            <button type="button" className={styles.headerButton} onClick={expandAllNodes}>Alle auf</button>
            <button type="button" className={styles.headerButton} onClick={collapseAllNodes}>Alle zu</button>
          </PanelHeader>
          <div className={styles.panelBody}>
            {treeRoots.length > 0 ? (
              <HierarchyTree
                roots={treeRoots}
                selectedNodeId={selectedNodeId}
                expandedNodeIds={expandedNodeIds}
                persistentManagersOpen={persistentManagersOpen}
                onSelectNode={setSelectedNodeId}
                onToggleNode={toggleNodeExpanded}
                onTogglePersistentManagers={() => setPersistentManagersOpen((current) => !current)}
                onDropDynamicNode={injectDynamicNode}
              />
            ) : (
              <p className={styles.empty}>Noch kein Tree. Das Game lädt im Viewport.</p>
            )}
          </div>
        </aside>

        <div className={`${styles.columnResizer} ${styles.leftColumnResizer}`} role="separator" aria-orientation="vertical" aria-label="Hierarchy Breite ändern" onPointerDown={(event) => startColumnResize('left', event)} />

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
        </section>

        <div className={`${styles.rowResizer} ${styles.assetRowResizer}`} role="separator" aria-orientation="horizontal" aria-label="Asset Explorer Höhe ändern" onPointerDown={startAssetHeightResize} />
        <PublicAssetExplorer
          roots={explorerRoots}
          selectedDirectory={selectedPublicDirectory}
          selectedDirectoryPath={selectedPublicDirectoryPath}
          selectedFile={selectedPublicFile}
          selectedFilePath={selectedPublicFilePath}
          expandedDirectoryPaths={expandedPublicDirectoryPaths}
          fileCount={publicFileCount}
          status={publicFileStatus}
          bodyRef={assetExplorerBodyRef}
          onSelectDirectory={selectPublicDirectory}
          onToggleDirectory={togglePublicDirectory}
          onSelectFile={setSelectedPublicFilePath}
          onOpenFile={setOpenNodeFilePath}
          onOpenImage={setPreviewPublicFilePath}
          onRefresh={refreshPublicFiles}
          onStartFolderResize={startFolderTreeResize}
          onDynamicNodeDragStart={() => void loadDynamicNodeManifest().then((manifest) => { dynamicNodeManifestRef.current = manifest; }).catch(() => undefined)}
        />

        <div className={`${styles.columnResizer} ${styles.rightColumnResizer}`} role="separator" aria-orientation="vertical" aria-label="Inspector Breite ändern" onPointerDown={(event) => startColumnResize('right', event)} />

        <aside className={styles.panel}>
          <PanelHeader title="Inspector" meta={selectedNode ? `${selectedNode.name}${gitSaveStatus ? ` · ${gitSaveStatus}` : ''}` : (gitSaveStatus || 'Kein Node')} />
          <div className={styles.panelBody}>
            {selectedNode ? <Inspector node={selectedNode} parentInactive={selectedNodeHasInactiveParent} definition={selectedNodeDefinition} debugProps={selectedNodeProps} resetVersion={inspectorResetVersion} overlayLayerSelection={overlayLayerSelections[selectedNode.id]} assets={imageAssets} onPatch={sendNodePatch} onOverlayLayerSelectionChange={setNodeOverlayLayerEnabled} onSelectAsset={setSelectedAssetId} /> : <p className={styles.empty}>Wähle einen Node in der Hierarchy.</p>}
          </div>
        </aside>
      </section>
      {savePreviewOpen && pendingChangeSet && <GitSavePreviewDialog changeSet={pendingChangeSet} needsRebase={gitNeedsRebase} onRemoveSetting={removePendingSetting} onCancel={() => setSavePreviewOpen(false)} onSave={savePendingChanges} />}
      {previewPublicFilePath && publicFileRoot && <PublicImageDialog file={findPublicFile(publicFileRoot, previewPublicFilePath)} root={publicFileRoot} onClose={() => setPreviewPublicFilePath(undefined)} />}
      {openNodeFilePath && <NodeSourceDialog path={openNodeFilePath} onClose={() => setOpenNodeFilePath(undefined)} />}
    </main>
  );
}

function GitSavePreviewDialog({
  changeSet,
  needsRebase,
  onRemoveSetting,
  onCancel,
  onSave,
}: {
  changeSet: EditorChangeSet;
  needsRebase: boolean;
  onRemoveSetting(change: EditorSetPropsChange, prop: string, field?: string): void | Promise<void>;
  onCancel(): void;
  onSave(): void | Promise<void>;
}) {
  const rows = pendingChangeRows(changeSet);
  return (
    <div className={styles.dialogBackdrop} role="dialog" aria-modal="true" onClick={onCancel}>
      <div className={styles.gitPreviewDialog} onClick={(event) => event.stopPropagation()}>
        <div className={styles.dialogHeader}>
          <strong>Git Save Preview · {rows.length} Setting{rows.length === 1 ? '' : 's'}</strong>
        </div>
        <div className={styles.gitPreviewBody}>
          {needsRebase && <p className={styles.previewWarning}>Remote ist voraus. Beim Speichern wird zuerst rebased.</p>}
          {rows.length > 0 ? (
            <div className={styles.gitPreviewTable}>
              <div className={styles.gitPreviewTableHeader}>Node</div>
              <div className={styles.gitPreviewTableHeader}>Prop</div>
              <div className={styles.gitPreviewTableHeader}>Wert</div>
              <div className={styles.gitPreviewTableHeader}></div>
              {rows.map(({ change, prop, field, label, value }) => (
                <div key={`${change.id}:${prop}:${field ?? ''}`} className={styles.gitPreviewRow}>
                  <div className={styles.gitPreviewPath}>{change.target.nodePath.join(' / ')}</div>
                  <div className={styles.gitPreviewProp}>{label}</div>
                  <code className={styles.gitPreviewValue}>{formatPendingValue(value)}</code>
                  <button type="button" className={styles.removeSettingButton} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void onRemoveSetting(change, prop, field); }}>Entfernen</button>
                </div>
              ))}
            </div>
          ) : <p className={styles.empty}>Keine Settings mehr im Save.</p>}
        </div>
        <div className={styles.gitPreviewFooter}>
          <button type="button" className={`${styles.button} ${styles.ghost}`} onClick={onCancel}>Abbrechen</button>
          <button type="button" className={styles.button} disabled={rows.length === 0} onClick={onSave}>{needsRebase ? 'Rebase + Speichern' : 'Speichern'}</button>
        </div>
      </div>
    </div>
  );
}

function PublicAssetExplorer({
  roots,
  selectedDirectory,
  selectedDirectoryPath,
  selectedFile,
  selectedFilePath,
  expandedDirectoryPaths,
  fileCount,
  status,
  bodyRef,
  onSelectDirectory,
  onToggleDirectory,
  onSelectFile,
  onOpenFile,
  onOpenImage,
  onRefresh,
  onStartFolderResize,
  onDynamicNodeDragStart,
}: {
  roots: PublicFileEntry[];
  selectedDirectory?: PublicFileEntry;
  selectedDirectoryPath: string;
  selectedFile?: PublicFileEntry;
  selectedFilePath?: string;
  expandedDirectoryPaths: Set<string>;
  fileCount: number;
  status: string;
  bodyRef: RefObject<HTMLDivElement | null>;
  onSelectDirectory(path: string): void;
  onToggleDirectory(path: string): void;
  onSelectFile(path: string): void;
  onOpenFile(path: string): void;
  onOpenImage(path: string): void;
  onRefresh(): void;
  onStartFolderResize(event: ReactPointerEvent<HTMLDivElement>): void;
  onDynamicNodeDragStart(file: PublicFileEntry): void;
}) {
  const childDirectories = selectedDirectory?.children?.filter((entry) => entry.kind === 'directory') ?? [];
  const files = selectedDirectory?.children?.filter((entry) => entry.kind === 'file') ?? [];

  return (
    <section className={styles.assetExplorer}>
      <PanelHeader title="Asset Explorer" meta={roots.length > 0 ? `${fileCount} Files · Git Repo` : status}>
        <button type="button" className={styles.headerButton} onClick={onRefresh}>Refresh</button>
      </PanelHeader>
      <div ref={bodyRef} className={styles.assetExplorerBody}>
        <div className={styles.folderTreePane}>
          {roots.length > 0 ? (
            roots.map((root) => (
              <PublicDirectoryTree
                key={root.path}
                directory={root}
                selectedPath={selectedDirectoryPath}
                expandedPaths={expandedDirectoryPaths}
                onSelect={onSelectDirectory}
                onToggle={onToggleDirectory}
              />
            ))
          ) : (
            <p className={styles.empty}>{status}</p>
          )}
        </div>
        <div className={styles.folderTreeResizer} role="separator" aria-orientation="vertical" aria-label="Ordnerbereich Breite ändern" onPointerDown={onStartFolderResize} />
        <div className={styles.fileListPane}>
          <div className={styles.fileListHeader}>
            <strong>{compactPublicPath(selectedDirectory?.path ?? 'apps/game/public')}</strong>
            <span>{childDirectories.length} Ordner · {files.length} Dateien</span>
          </div>
          <div className={styles.assetGrid}>
            {childDirectories.map((directory) => (
              <button key={directory.path} type="button" className={styles.assetTile} onClick={() => onSelectDirectory(directory.path)}>
                <div className={styles.fileTileIcon}><Folder size={30} /></div>
                <span>{directory.name}</span>
                <small>Ordner</small>
              </button>
            ))}
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                className={`${styles.assetTile} ${file.path === selectedFilePath ? styles.selectedAssetTile : ''}`}
                draggable={isDynamicNodeFile(file)}
                onDragStart={(event) => {
                  if (!isDynamicNodeFile(file)) return;
                  event.dataTransfer.effectAllowed = 'copy';
                  event.dataTransfer.setData(dynamicNodeDragMimeType, JSON.stringify(file));
                  onDynamicNodeDragStart(file);
                }}
                onClick={() => onSelectFile(file.path)}
                onDoubleClick={() => { if (isCodePreviewFile(file)) onOpenFile(file.path); }}
                title={file.path}
              >
                <PublicFileThumbnail file={file} />
                <span>{file.name}</span>
                <small>{formatFileMeta(file)}</small>
              </button>
            ))}
            {!selectedDirectory && <p className={styles.empty}>{status}</p>}
            {selectedDirectory && childDirectories.length === 0 && files.length === 0 && <p className={styles.empty}>Dieser Ordner ist leer.</p>}
          </div>
        </div>
        <PublicFileDetails file={selectedFile} onOpenImage={onOpenImage} onOpenFile={onOpenFile} />
      </div>
    </section>
  );
}

function PublicFileThumbnail({ file }: { file: PublicFileEntry }) {
  if (isNodeFile(file)) return <div className={styles.fileTileIcon}><Code2 size={30} /><span>NODE</span></div>;
  if (isPublicJsonFile(file)) return <div className={styles.fileTileIcon}><Code2 size={30} /><span>JSON</span></div>;
  if (isImageFile(file)) return <QueuedPublicImageThumbnail file={file} />;
  if (isAudioFile(file)) return <div className={styles.fileTileIcon}><TypeIcon size={28} /><span>{file.extension?.toUpperCase() ?? 'AUDIO'}</span></div>;
  return <div className={styles.fileTileIcon}><FileIcon size={30} /><span>{file.extension?.toUpperCase() ?? 'FILE'}</span></div>;
}

function QueuedPublicImageThumbnail({ file }: { file: PublicFileEntry }) {
  const [src, setSrc] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | undefined;
    setSrc(undefined);
    setFailed(false);
    const task = enqueueThumbnailLoad(publicFileThumbnailUrl(file), (blob) => {
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    }, () => setFailed(true));
    return () => {
      task.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.path, file.size]);

  if (src) return <img className={styles.assetThumbnail} src={src} alt={file.name} loading="lazy" decoding="async" />;
  return <div className={styles.fileTileIcon}><ImageIcon size={30} /><span>{failed ? 'ERR' : 'LÄDT'}</span></div>;
}

function PublicFileDetails({ file, onOpenImage, onOpenFile }: { file?: PublicFileEntry; onOpenImage(path: string): void; onOpenFile(path: string): void }) {
  if (!file) return <aside className={styles.assetDetails}><p className={styles.empty}>Wähle eine Datei.</p></aside>;
  const url = isCodePreviewFile(file) ? '' : publicFileContentUrl(file);
  return (
    <aside className={styles.assetDetails}>
      <div className={styles.publicFilePreviewPane}>
        {isCodePreviewFile(file) ? (
          <button type="button" className={styles.assetPreviewLarge} onClick={() => onOpenFile(file.path)} aria-label={`${file.name} öffnen`}>
            <Code2 size={46} />
            <span>Datei öffnen</span>
            <span className={styles.assetPreviewHint}>Doppelklick im Grid öffnet sie ebenfalls</span>
          </button>
        ) : isImageFile(file) ? (
          <button type="button" className={styles.assetPreviewLarge} onClick={() => onOpenImage(file.path)} aria-label={`${file.name} groß anzeigen`}>
            <img className={styles.assetImagePreview} src={url} alt={file.name} loading="lazy" />
            <span className={styles.assetPreviewHint}>Klick für Großansicht</span>
          </button>
        ) : isAudioFile(file) ? (
          <div className={styles.audioPreview}>
            <FileIcon size={34} />
            <strong>{file.name}</strong>
            <audio controls src={url} preload="metadata" />
          </div>
        ) : (
          <div className={styles.assetPreviewMissing}>Keine Vorschau für diesen Dateityp.</div>
        )}
      </div>
      <div className={styles.assetMetaPanel}>
        <div className={styles.assetMetaHeader}>
          <strong>{file.name}</strong>
          <span>{formatFileMeta(file)}</span>
        </div>
        <div className={styles.assetMetaGrid}>
          <FragmentRow name="path" value={file.path} />
          <FragmentRow name="type" value={file.extension ?? 'file'} />
          <FragmentRow name="size" value={formatFileSize(file.size ?? 0)} />
          <FragmentRow name="url" value={url} />
        </div>
      </div>
    </aside>
  );
}

function NodeSourceDialog({ path, onClose }: { path: string; onClose(): void }) {
  const [file, setFile] = useState<NodeSourceFileContent | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const controller = new AbortController();
    setFile(undefined);
    setError(undefined);
    void loadEditorSourceFile(path, controller.signal)
      .then(setFile)
      .catch((loadError) => {
        if (!(loadError instanceof DOMException && loadError.name === 'AbortError')) setError(loadError instanceof Error ? loadError.message : String(loadError));
      });
    return () => controller.abort();
  }, [path]);

  return (
    <div className={styles.dialogBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.codeDialog} onClick={(event) => event.stopPropagation()}>
        <div className={styles.dialogHeader}>
          <strong>{compactPublicPath(path)}</strong>
          <button type="button" className={styles.headerButton} onClick={onClose}>Schließen</button>
        </div>
        <div className={styles.codeDialogBody}>
          {error && <p className={styles.empty}>Datei konnte nicht geladen werden: {error}</p>}
          {!error && !file && <p className={styles.empty}>Lade Datei...</p>}
          {file && (
            <MonacoEditor
              height="100%"
              language={editorLanguageForPath(file.path)}
              path={`file:///${file.path}`}
              value={file.content}
              theme="vs-dark"
              options={{ readOnly: true, minimap: { enabled: true }, fontSize: 13, wordWrap: 'off', automaticLayout: true, scrollBeyondLastLine: false }}
              beforeMount={(monaco) => {
                monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
                  target: monaco.languages.typescript.ScriptTarget.ES2022,
                  module: monaco.languages.typescript.ModuleKind.ESNext,
                  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
                  jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
                  strict: true,
                  allowNonTsExtensions: true,
                  esModuleInterop: true,
                  skipLibCheck: true,
                });
                monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ noSyntaxValidation: false, noSemanticValidation: true, noSuggestionDiagnostics: true });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PublicImageDialog({ file, root, onClose }: { file?: PublicFileEntry; root: PublicFileEntry; onClose(): void }) {
  const [frames, setFrames] = useState<PublicAtlasFrame[]>([]);
  const [selectedFrameId, setSelectedFrameId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<'frame' | 'atlas'>('frame');
  const metadataFile = file ? findAtlasMetadataFile(root, file) : undefined;
  const src = file ? publicFileContentUrl(file) : undefined;

  useEffect(() => {
    let disposed = false;
    setFrames([]);
    setSelectedFrameId(undefined);
    setActiveTab('frame');
    if (!metadataFile) return;
    fetch(publicFileContentUrl(metadataFile), { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then((response) => response.ok ? response.json() : undefined)
      .then((json) => {
        if (disposed) return;
        const parsed = parseAtlasFrames(json);
        setFrames(parsed);
        setSelectedFrameId(parsed[0]?.id);
      })
      .catch(() => undefined);
    return () => { disposed = true; };
  }, [metadataFile?.path]);

  if (!file || !src) return null;
  const selectedFrame = selectedFrameId ? frames.find((frame) => frame.id === selectedFrameId) : undefined;
  const showAtlasViewer = frames.length > 0;

  return (
    <div className={styles.dialogBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.assetDialog} onClick={(event) => event.stopPropagation()}>
        <div className={styles.dialogHeader}>
          <strong>{file.name}</strong>
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
                <button key={frame.id} type="button" className={`${styles.frameListItem} ${frame.id === selectedFrame?.id ? styles.selectedFrameListItem : ''}`} onClick={() => setSelectedFrameId(frame.id)}>
                  <PublicFramePreview src={src} frame={frame} compact />
                  <span>{frame.label}</span>
                  <small>{frame.rect.width}×{frame.rect.height}</small>
                </button>
              ))}
            </aside>
            <section className={styles.atlasPreviewPanel}>
              {activeTab === 'frame' && selectedFrame ? (
                <div className={styles.dialogFramePreview}><PublicFramePreview src={src} frame={selectedFrame} compact={false} /></div>
              ) : (
                <PublicAtlasImageWithFrame src={src} fileName={file.name} selectedFrame={selectedFrame} />
              )}
              {selectedFrame && (
                <div className={styles.dialogFrameMeta}>
                  <strong>{selectedFrame.label}</strong>
                  <span>{selectedFrame.rect.x},{selectedFrame.rect.y} · {selectedFrame.rect.width}×{selectedFrame.rect.height}</span>
                </div>
              )}
            </section>
          </div>
        ) : (
          <img className={styles.originalAssetImage} src={src} alt={file.name} />
        )}
      </div>
    </div>
  );
}

function PublicFramePreview({ src, frame, compact }: { src: string; frame: PublicAtlasFrame; compact: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    const image = new Image();
    image.onload = () => {
      canvas.width = frame.rect.width;
      canvas.height = frame.rect.height;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, frame.rect.x, frame.rect.y, frame.rect.width, frame.rect.height, 0, 0, canvas.width, canvas.height);
    };
    image.src = src;
  }, [src, frame]);
  return <canvas ref={canvasRef} className={compact ? styles.assetThumbnail : styles.assetImagePreview} aria-label={frame.label} />;
}

function PublicAtlasImageWithFrame({ src, fileName, selectedFrame }: { src: string; fileName: string; selectedFrame?: PublicAtlasFrame }) {
  const [size, setSize] = useState<{ width: number; height: number } | undefined>();
  const rect = selectedFrame?.rect;
  return (
    <div className={styles.atlasImageStage}>
      <div className={styles.atlasImageWrap}>
        <img className={styles.originalAssetImage} src={src} alt={fileName} onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
        {rect && size && size.width > 0 && size.height > 0 && (
          <div className={styles.frameRectOverlay} style={{ left: `${(rect.x / size.width) * 100}%`, top: `${(rect.y / size.height) * 100}%`, width: `${(rect.width / size.width) * 100}%`, height: `${(rect.height / size.height) * 100}%` }} />
        )}
      </div>
    </div>
  );
}

function PublicDirectoryTree({
  directory,
  selectedPath,
  expandedPaths,
  onSelect,
  onToggle,
  depth = 0,
}: {
  directory: PublicFileEntry;
  selectedPath: string;
  expandedPaths: Set<string>;
  onSelect(path: string): void;
  onToggle(path: string): void;
  depth?: number;
}) {
  const directories = directory.children?.filter((entry) => entry.kind === 'directory') ?? [];
  const isExpanded = expandedPaths.has(directory.path);
  const isSelected = selectedPath === directory.path;

  return (
    <div className={styles.directoryTreeItem}>
      <div className={`${styles.directoryRow} ${isSelected ? styles.selectedDirectoryRow : ''}`} style={{ paddingLeft: 6 + depth * 12 }}>
        <button type="button" className={styles.directoryToggle} onClick={() => onToggle(directory.path)} aria-label={`${directory.name} ${isExpanded ? 'zuklappen' : 'aufklappen'}`} disabled={directories.length === 0}>
          {directories.length > 0 ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span />}
        </button>
        <button type="button" className={styles.directoryNameButton} onClick={() => onSelect(directory.path)}>
          {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
          <span>{directory.name}</span>
        </button>
      </div>
      {isExpanded && directories.map((child) => (
        <PublicDirectoryTree
          key={child.path}
          directory={child}
          selectedPath={selectedPath}
          expandedPaths={expandedPaths}
          onSelect={onSelect}
          onToggle={onToggle}
          depth={depth + 1}
        />
      ))}
    </div>
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

function HierarchyTree({
  roots,
  selectedNodeId,
  expandedNodeIds,
  persistentManagersOpen,
  onSelectNode,
  onToggleNode,
  onTogglePersistentManagers,
  onDropDynamicNode,
}: {
  roots: DebugNodeDescriptor[];
  selectedNodeId?: string;
  expandedNodeIds: ReadonlySet<string>;
  persistentManagersOpen: boolean;
  onSelectNode(id: string): void;
  onToggleNode(id: string): void;
  onTogglePersistentManagers(): void;
  onDropDynamicNode(parent: DebugNodeDescriptor, file: PublicFileEntry): void | Promise<void>;
}) {
  const { persistentManagers, scenes } = splitHierarchyRoots(roots);

  return (
    <div className={styles.hierarchyGroups}>
      {persistentManagers.length > 0 && (
        <section className={styles.hierarchyGroup}>
          <button type="button" className={styles.hierarchyGroupHeader} onClick={onTogglePersistentManagers} aria-expanded={persistentManagersOpen}>
            {persistentManagersOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Boxes size={13} />
            <span>Persistent Managers</span>
            <span className={styles.hierarchyGroupCount}>{countNodes(persistentManagers)}</span>
          </button>
          {persistentManagersOpen && <NodeTree nodes={persistentManagers} selectedNodeId={selectedNodeId} expandedNodeIds={expandedNodeIds} onSelectNode={onSelectNode} onToggleNode={onToggleNode} onDropDynamicNode={onDropDynamicNode} />}
        </section>
      )}

      <section className={styles.hierarchyGroup}>
        <div className={styles.hierarchyGroupHeaderStatic}>
          <Layers size={13} />
          <span>Scenes</span>
          <span className={styles.hierarchyGroupCount}>{countNodes(scenes)}</span>
        </div>
        <NodeTree nodes={scenes} selectedNodeId={selectedNodeId} expandedNodeIds={expandedNodeIds} onSelectNode={onSelectNode} onToggleNode={onToggleNode} onDropDynamicNode={onDropDynamicNode} />
      </section>
    </div>
  );
}

function NodeTree({
  nodes,
  selectedNodeId,
  expandedNodeIds,
  onSelectNode,
  onToggleNode,
  onDropDynamicNode,
}: {
  nodes: DebugNodeDescriptor[];
  selectedNodeId?: string;
  expandedNodeIds: ReadonlySet<string>;
  onSelectNode(id: string): void;
  onToggleNode(id: string): void;
  onDropDynamicNode(parent: DebugNodeDescriptor, file: PublicFileEntry): void | Promise<void>;
}) {
  return (
    <ol className={styles.treeList}>
      {nodes.map((node) => (
        <NodeTreeItem key={node.id} node={node} selectedNodeId={selectedNodeId} expandedNodeIds={expandedNodeIds} onSelectNode={onSelectNode} onToggleNode={onToggleNode} onDropDynamicNode={onDropDynamicNode} />
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
  onDropDynamicNode,
}: {
  node: DebugNodeDescriptor;
  selectedNodeId?: string;
  expandedNodeIds: ReadonlySet<string>;
  onSelectNode(id: string): void;
  onToggleNode(id: string): void;
  onDropDynamicNode(parent: DebugNodeDescriptor, file: PublicFileEntry): void | Promise<void>;
}) {
  const hasChildren = node.children.length > 0;
  const effectiveActive = isEffectivelyActive(node);
  const alwaysExpanded = isAppRootNode(node);
  const isExpanded = effectiveActive && (alwaysExpanded || expandedNodeIds.has(node.id));
  const NodeIcon = iconForNode(node);

  function handleDragOver(event: ReactDragEvent<HTMLDivElement>): void {
    if (!readDynamicNodeDragFile(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleDrop(event: ReactDragEvent<HTMLDivElement>): void {
    const file = readDynamicNodeDragFile(event);
    if (!file) return;
    event.preventDefault();
    void onDropDynamicNode(node, file);
  }

  return (
    <li className={`${styles.treeItem} ${alwaysExpanded ? styles.rootTreeItem : ''}`}>
      <div className={`${styles.nodeRow} ${!effectiveActive ? styles.inactiveNode : ''} ${!node.active && effectiveActive ? styles.locallyInactiveNode : ''} ${node.id === selectedNodeId ? styles.selectedNode : ''}`} onDragOver={handleDragOver} onDrop={handleDrop}>
        <button
          type="button"
          className={styles.expandButton}
          disabled={!hasChildren || alwaysExpanded}
          aria-label={hasChildren && !alwaysExpanded ? (isExpanded ? `${node.name} einklappen` : `${node.name} aufklappen`) : undefined}
          onClick={() => {
            if (!alwaysExpanded) onToggleNode(node.id);
          }}
        >
          {hasChildren && !alwaysExpanded ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className={styles.expandSpacer} />}
        </button>
        <button type="button" className={styles.nodeContent} onClick={() => onSelectNode(node.id)}>
          <NodeIcon className={styles.nodeIcon} size={14} />
          <span className={styles.nodeName}>{node.name}</span>
          <span className={styles.nodeMeta}>{node.className}</span>
          {!node.active && <span className={styles.nodeFlag}>inactive</span>}
          {node.active && !effectiveActive && <span className={styles.nodeFlag}>parent inactive</span>}
          {!node.visible && <span className={styles.nodeFlag}>hidden</span>}
        </button>
      </div>
      {hasChildren && isExpanded && <NodeTree nodes={node.children} selectedNodeId={selectedNodeId} expandedNodeIds={expandedNodeIds} onSelectNode={onSelectNode} onToggleNode={onToggleNode} onDropDynamicNode={onDropDynamicNode} />}
    </li>
  );
}

function isAppRootNode(node: DebugNodeDescriptor): boolean {
  return node.name === 'App-Root' && node.className === 'NodeRoot';
}

function iconForNode(node: DebugNodeDescriptor) {
  const className = node.className.toLowerCase();
  const name = node.name.toLowerCase();

  if (className.includes('scenenode')) return Layers;
  if (className.includes('collisionrectnode')) return Square;
  if (className.includes('animatedimagenode')) return Frame;
  if (className.includes('imagenode') || name.includes('image')) return ImageIcon;
  if (className.includes('textnode')) return TypeIcon;
  if (className.includes('input')) return Gamepad2;
  if (className.includes('mining')) return Crosshair;
  if (className.includes('touch')) return MousePointer2;
  if (className.includes('hud') || name.includes('hud') || name.startsWith('ui.')) return Boxes;
  if (className.includes('node')) return Box;
  return Box;
}

function Inspector({
  node,
  parentInactive,
  definition,
  debugProps,
  resetVersion,
  overlayLayerSelection,
  assets,
  onPatch,
  onOverlayLayerSelectionChange,
  onSelectAsset,
}: {
  node: DebugNodeDescriptor;
  parentInactive: boolean;
  definition?: DebugSceneNodeDefinition;
  debugProps?: DebugNodePropsMessage;
  resetVersion: number;
  overlayLayerSelection?: string[];
  assets: DebugImageAssetDescriptor[];
  onPatch(node: DebugNodeDescriptor, props: DebugNodePatch): void;
  onOverlayLayerSelectionChange(node: DebugNodeDescriptor, layerIds: string[]): void;
  onSelectAsset(id: string): void;
}) {
  const canToggleVisible = Boolean(definition?.exposedPropGroups?.some((group) => group.name === 'Presentation' && group.props.visible) ?? flattenDefinitionProps(definition).visible);
  return (
    <div className={styles.inspector}>
      <div className={styles.inspectorHeaderCard}>
        <strong className={styles.inspectorNodeName}>{node.name}</strong>
        <div className={styles.inspectorHeaderRight}>
          <span className={styles.inspectorClassTag}>{node.className}</span>
          <button type="button" className={`${styles.inspectorIconButton} ${(!node.active || parentInactive) ? styles.inspectorIconButtonOff : ''}`} disabled={parentInactive} title={parentInactive ? 'Parent ist inactive' : node.active ? 'Node deaktivieren' : 'Node aktivieren'} aria-label={parentInactive ? 'Parent ist inactive' : node.active ? 'Node deaktivieren' : 'Node aktivieren'} onClick={() => onPatch(node, { active: !node.active })}>
            {node.active && !parentInactive ? <Power size={15} /> : <PowerOff size={15} />}
          </button>
          {canToggleVisible && (
            <button type="button" className={`${styles.inspectorIconButton} ${!node.visible ? styles.inspectorIconButtonOff : ''}`} title={node.visible ? 'Node verstecken' : 'Node anzeigen'} aria-label={node.visible ? 'Node verstecken' : 'Node anzeigen'} onClick={() => onPatch(node, { visible: !node.visible })}>
              {node.visible ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
          )}
        </div>
      </div>
      <OverlayLayersDropdown node={node} definition={definition} selection={overlayLayerSelection} onChange={onOverlayLayerSelectionChange} />
      <ExposedPropsSection node={node} definition={definition} debugProps={debugProps} resetVersion={resetVersion} assets={assets} onPatch={onPatch} />
      <InspectorSection title="Debug · read-only" defaultOpen={false}>
        <FragmentRow name={node.instanceId ? 'instanceId' : 'runtimeId'} value={node.instanceId ?? node.id} />
        <FragmentRow name="index" value={node.index} />
        <FragmentRow name="children" value={node.children.length} />
        <FragmentRow name="worldBounds" value={formatBounds(debugProps?.worldBounds ?? debugProps?.bounds)} />
      </InspectorSection>
    </div>
  );
}

function flattenDefinitionProps(definition?: DebugSceneNodeDefinition): Record<string, DebugScenePropDefinition> {
  if (!definition) return {};
  const groups = definition.exposedPropGroups ?? [];
  return Object.assign({}, ...groups.map((group) => group.props));
}

function OverlayLayersDropdown({
  node,
  definition,
  selection,
  onChange,
}: {
  node: DebugNodeDescriptor;
  definition?: DebugSceneNodeDefinition;
  selection?: string[];
  onChange(node: DebugNodeDescriptor, layerIds: string[]): void;
}) {
  const layers = definition?.overlayLayers ?? [];
  const enabledLayerIds = new Set(selection ?? layers.map((layer) => layer.id));
  const enabledCount = layers.filter((layer) => enabledLayerIds.has(layer.id)).length;

  function setLayerEnabled(layer: DebugOverlayLayerDescriptor, enabled: boolean): void {
    const next = new Set(enabledLayerIds);
    if (enabled) next.add(layer.id);
    else next.delete(layer.id);
    onChange(node, layers.filter((candidate) => next.has(candidate.id)).map((candidate) => candidate.id));
  }

  function enableAll(): void {
    onChange(node, layers.map((layer) => layer.id));
  }

  function disableAll(): void {
    onChange(node, []);
  }

  if (layers.length === 0) return null;

  return (
    <details className={styles.overlayDropdown}>
      <summary className={styles.overlayDropdownSummary}>
        <span>Debug Overlays</span>
        <strong>{enabledCount}/{layers.length}</strong>
      </summary>
      <div className={styles.overlayDropdownPanel}>
        <div className={styles.overlayLayerActions}>
          <button type="button" className={styles.miniButton} onClick={enableAll}>Alle</button>
          <button type="button" className={styles.miniButton} onClick={disableAll}>Keine</button>
        </div>
        {layers.map((layer) => (
          <label key={layer.id} className={styles.overlayLayerRow}>
            <input type="checkbox" checked={enabledLayerIds.has(layer.id)} onChange={(event) => setLayerEnabled(layer, event.currentTarget.checked)} />
            <span>{layer.label}</span>
            <code>{layer.source}</code>
          </label>
        ))}
      </div>
    </details>
  );
}

function ExposedPropsSection({
  node,
  definition,
  debugProps,
  resetVersion,
  assets,
  onPatch,
}: {
  node: DebugNodeDescriptor;
  definition?: DebugSceneNodeDefinition;
  debugProps?: DebugNodePropsMessage;
  resetVersion: number;
  assets: DebugImageAssetDescriptor[];
  onPatch(node: DebugNodeDescriptor, props: DebugNodePatch): void;
}) {
  const [localOverrides, setLocalOverrides] = useState<DebugNodePatch>({});
  const lastPatchSignatureRef = useRef<string>('');

  useEffect(() => {
    setLocalOverrides({});
    lastPatchSignatureRef.current = '';
  }, [node.id]);

  useEffect(() => {
    setLocalOverrides({});
  }, [debugProps?.sentAt, resetVersion]);

  function patchProp(key: string, value: DebugNodePatch[string]): void {
    const patch: DebugNodePatch = key === 'size'
      ? { size: value, sizeMode: value === null ? 'content' : 'explicit' }
      : { [key]: value };
    const signature = `${node.id}:${JSON.stringify(patch)}`;
    if (lastPatchSignatureRef.current === signature) return;
    lastPatchSignatureRef.current = signature;
    setLocalOverrides((current) => ({ ...current, [key]: value }));
    onPatch(node, patch);
  }

  const groups = definition?.exposedPropGroups;

  return (
    <>
      {groups ? groups.filter((group) => group.name !== 'State' && group.name !== 'Presentation').map((group) => {
        const visibleProps = Object.entries(group.props).filter(([key]) => key !== 'sizeMode');
        return (
        <InspectorSection key={group.name} title={group.name}>
          {visibleProps.map(([key, prop]) => (
            <EditablePropRow
              key={`${node.id}:${key}`}
              name={key}
              prop={prop}
              value={key in localOverrides ? localOverrides[key] : currentEditablePropValue(key, prop, node, debugProps)}
              debugProps={debugProps}
              resetVersion={resetVersion}
              assets={assets}
              onCommit={(value) => patchProp(key, value)}
            />
          ))}
        </InspectorSection>
        );
      }) : <InspectorSection title="Exposed Props"><FragmentRow name="status" value="Keine Node-Definition für diesen Node." /></InspectorSection>}
    </>
  );
}

const inputCommitDebounceMs = 250;

function EditablePropRow({
  name,
  prop,
  value,
  debugProps,
  resetVersion,
  assets,
  onCommit,
}: {
  name: string;
  prop: DebugScenePropDefinition;
  value: unknown;
  debugProps?: DebugNodePropsMessage;
  resetVersion: number;
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
    clearCommitTimer();
    setEditing(false);
    setDraft(value);
    lastCommitSignatureRef.current = '';
  }, [resetVersion]);

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
    if (name === 'rotation') {
      const radians = parseFiniteNumber(draft) ?? 0;
      const degrees = roundDegreeNumber(radiansToDegrees(radians));
      return (
        <>
          <span>{label}</span>
          <div className={styles.rotationEditor}>
            <input className={styles.rotationSlider} type="range" min={-360} max={360} step={1} value={clamp(degrees, -360, 360)} disabled={prop.readOnly} onChange={(event) => scheduleCommit(degreesToRadians(Number(event.currentTarget.value)))} onBlur={() => commit()} />
            <DragNumberInput value={degrees} min={-360} max={360} step={1} suffix="°" integer precision={0} disabled={prop.readOnly} onChange={(next) => scheduleCommit(degreesToRadians(next))} onCommit={(next) => commit(degreesToRadians(next))} />
          </div>
        </>
      );
    }
    return (
      <>
        <span>{label}</span>
        <DragNumberInput value={parseFiniteNumber(draft) ?? 0} min={prop.min} max={prop.max} step={prop.step ?? 1} disabled={prop.readOnly} onChange={scheduleCommit} onCommit={(next) => commit(next)} />
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
    const originPreset = prop.type === 'Origin' ? originPresetValue(point) : '';
    const scalePrecision = prop.type === 'Scale' ? 2 : undefined;
    const normalizePointValue = prop.type === 'Scale' ? roundScalePoint : (value: { x: number | string; y: number | string }) => value;
    return (
      <>
        <span>{label}</span>
        <div className={styles.vectorEditorStack}>
          {prop.type === 'Origin' && (
            <select className={styles.editorInput} value={originPreset} disabled={prop.readOnly} onChange={(event) => commit(originPresetPoint(event.currentTarget.value) ?? point)}>
              <option value="">Custom</option>
              {originPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </select>
          )}
          <div className={prop.type === 'Scale' ? styles.scaleEditor : styles.vectorEditor}>
            <DragNumberInput value={parseFiniteNumber(point.x) ?? 0} min={prop.min ?? (prop.type === 'Scale' ? 0 : undefined)} max={prop.max ?? (prop.type === 'Scale' ? 5 : undefined)} step={prop.step ?? (prop.type === 'Position' ? 1 : 0.01)} integer={prop.type === 'Position'} precision={scalePrecision} disabled={prop.readOnly} onChange={(next) => scheduleCommit(normalizePointValue({ x: next, y: point.y }))} onCommit={(next) => commit(normalizePointValue({ x: next, y: point.y }), { keepEditing: true })} />
            <DragNumberInput value={parseFiniteNumber(point.y) ?? 0} min={prop.min ?? (prop.type === 'Scale' ? 0 : undefined)} max={prop.max ?? (prop.type === 'Scale' ? 5 : undefined)} step={prop.step ?? (prop.type === 'Position' ? 1 : 0.01)} integer={prop.type === 'Position'} precision={scalePrecision} disabled={prop.readOnly} onChange={(next) => scheduleCommit(normalizePointValue({ x: point.x, y: next }))} onCommit={(next) => commit(normalizePointValue({ x: point.x, y: next }), { keepEditing: true })} />
            {prop.type === 'Scale' && <button type="button" className={styles.resetMiniButton} disabled={prop.readOnly} title="Scale auf 1 / 1 zurücksetzen" onClick={() => commit({ x: 1, y: 1 })}>Reset</button>}
          </div>
        </div>
      </>
    );
  }

  if (prop.type === 'Size') {
    const computedSize = debugProps?.localTransform ? { width: debugProps.localTransform.width, height: debugProps.localTransform.height } : undefined;
    const size = isSizeValue(draft) ? draft : isSizeValue(value) ? value : computedSize ?? { width: 0, height: 0 };
    const calculatedFromContent = draft === null || debugProps?.props.sizeMode === 'content';
    return (
      <>
        <span>{label}</span>
        <div className={styles.sizeEditorStack}>
          <label className={styles.inlineCheckboxLabel}>
            <input type="checkbox" checked={calculatedFromContent} disabled={prop.readOnly} onChange={(event) => commit(event.currentTarget.checked ? null : size)} />
            <span>Calculate from Content</span>
          </label>
          <div className={styles.vectorEditor}>
            <input className={styles.editorInput} type="number" value={numberInputValue(size.width)} step={prop.step ?? 1} min={prop.min ?? 0} max={prop.max} disabled={prop.readOnly || calculatedFromContent} onFocus={() => setEditing(true)} onKeyDown={commitOnEnter} onChange={(event) => scheduleCommit({ width: event.currentTarget.value, height: size.height })} onBlur={() => commit()} />
            <input className={styles.editorInput} type="number" value={numberInputValue(size.height)} step={prop.step ?? 1} min={prop.min ?? 0} max={prop.max} disabled={prop.readOnly || calculatedFromContent} onFocus={() => setEditing(true)} onKeyDown={commitOnEnter} onChange={(event) => scheduleCommit({ width: size.width, height: event.currentTarget.value })} onBlur={() => commit()} />
          </div>
        </div>
      </>
    );
  }

  return <FragmentRow name={label} value="Unsupported" />;
}



function degreesToRadians(degrees: number): number {
  return roundRotationNumber((degrees * Math.PI) / 180);
}

function roundRotationNumber(value: number): number {
  return Number(value.toFixed(3));
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function roundDegreeNumber(value: number): number {
  return Math.round(value);
}

function DragNumberInput({
  value,
  min,
  max,
  step,
  suffix = '',
  integer = false,
  precision,
  disabled = false,
  onChange,
  onCommit,
}: {
  value: number;
  min?: number;
  max?: number;
  step: number;
  suffix?: string;
  integer?: boolean;
  precision?: number;
  disabled?: boolean;
  onChange(value: number): void;
  onCommit(value: number): void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!editMode) setDraft(formatEditableNumber(value, suffix, precision ?? 4));
  }, [editMode, precision, suffix, value]);

  function normalize(next: number): number {
    const clamped = clamp(next, min ?? -Number.MAX_SAFE_INTEGER, max ?? Number.MAX_SAFE_INTEGER);
    return integer ? Math.round(clamped) : Number(clamped.toFixed(precision ?? 4));
  }

  function startDrag(event: ReactPointerEvent<HTMLInputElement>): void {
    if (disabled || editMode || event.button !== 0) return;
    event.preventDefault();
    const input = event.currentTarget;
    input.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startValue = value;
    let latest = value;

    function onMove(moveEvent: PointerEvent): void {
      latest = normalize(startValue + (moveEvent.clientX - startX) * step);
      onChange(latest);
    }

    function onEnd(): void {
      window.removeEventListener('pointermove', onMove);
      onCommit(latest);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd, { once: true });
    window.addEventListener('pointercancel', onEnd, { once: true });
  }

  function commitText(): void {
    const parsed = parseFiniteNumber(draft.replace(suffix, ''));
    setEditMode(false);
    if (parsed !== undefined) onCommit(normalize(parsed));
  }

  return (
    <input
      className={`${styles.editorInput} ${styles.dragNumberInput}`}
      type="text"
      value={editMode ? draft : formatEditableNumber(value, suffix, precision ?? 4)}
      disabled={disabled}
      readOnly={!editMode}
      title={editMode ? 'Enter bestätigt' : 'Ziehen zum Ändern, Doppelklick zum Tippen'}
      onPointerDown={startDrag}
      onDoubleClick={(event) => {
        setEditMode(true);
        setDraft(formatPlainNumber(value, precision ?? 4));
        window.setTimeout(() => event.currentTarget.select(), 0);
      }}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commitText();
          event.currentTarget.blur();
        }
      }}
      onBlur={commitText}
    />
  );
}

function formatPlainNumber(value: number, precision = 4): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(precision)));
}

function formatEditableNumber(value: number, suffix: string, precision = 4): string {
  return `${formatPlainNumber(value, precision)}${suffix}`;
}

const originPresets = [
  { id: 'top-left', label: 'Top Left', x: 0, y: 0 },
  { id: 'top-center', label: 'Top Center', x: 0.5, y: 0 },
  { id: 'top-right', label: 'Top Right', x: 1, y: 0 },
  { id: 'center-left', label: 'Center Left', x: 0, y: 0.5 },
  { id: 'center', label: 'Center', x: 0.5, y: 0.5 },
  { id: 'center-right', label: 'Center Right', x: 1, y: 0.5 },
  { id: 'bottom-left', label: 'Bottom Left', x: 0, y: 1 },
  { id: 'bottom-center', label: 'Bottom Center', x: 0.5, y: 1 },
  { id: 'bottom-right', label: 'Bottom Right', x: 1, y: 1 },
] as const;

function originPresetPoint(id: string): { x: number; y: number } | undefined {
  const preset = originPresets.find((candidate) => candidate.id === id);
  return preset ? { x: preset.x, y: preset.y } : undefined;
}

function originPresetValue(point: { x: number | string; y: number | string }): string {
  const x = parseFiniteNumber(point.x);
  const y = parseFiniteNumber(point.y);
  if (x === undefined || y === undefined) return '';
  return originPresets.find((preset) => Math.abs(preset.x - x) < 0.0001 && Math.abs(preset.y - y) < 0.0001)?.id ?? '';
}

function coerceEditableValue(prop: DebugScenePropDefinition, value: unknown): DebugNodePatch[string] | undefined {
  if (prop.type === 'String' || prop.type === 'AssetId' || prop.type === 'Anchor') return typeof value === 'string' ? value : undefined;
  if (prop.type === 'Boolean') return typeof value === 'boolean' ? value : undefined;
  if (prop.type === 'Number') return parseFiniteNumber(value);
  if (prop.type === 'Position' || prop.type === 'Origin' || prop.type === 'Scale') {
    if (!isPointValue(value)) return undefined;
    const x = parseFiniteNumber(value.x);
    const y = parseFiniteNumber(value.y);
    if (x === undefined || y === undefined) return undefined;
    return prop.type === 'Scale' ? { x: roundScaleNumber(x), y: roundScaleNumber(y) } : { x, y };
  }
  if (prop.type === 'Size') {
    if (value === null) return null;
    if (!isSizeValue(value)) return undefined;
    const width = parseFiniteNumber(value.width);
    const height = parseFiniteNumber(value.height);
    return width === undefined || height === undefined ? undefined : { width, height };
  }
  return undefined;
}

function roundScalePoint(value: { x: number | string; y: number | string }): { x: number; y: number } {
  return { x: roundScaleNumber(parseFiniteNumber(value.x) ?? 0), y: roundScaleNumber(parseFiniteNumber(value.y) ?? 0) };
}

function roundScaleNumber(value: number): number {
  return Number(value.toFixed(2));
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

function InspectorSection({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
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


function findParentNode(nodes: DebugNodeDescriptor[], child: DebugNodeDescriptor): DebugNodeDescriptor | undefined {
  if (!child.parentId) return undefined;
  return findNode(nodes, child.parentId);
}

function hasInactiveAncestor(nodes: DebugNodeDescriptor[], node: DebugNodeDescriptor): boolean {
  let parent = findParentNode(nodes, node);
  while (parent) {
    if (!parent.active) return true;
    parent = findParentNode(nodes, parent);
  }
  return false;
}

function countNodes(nodes: DebugNodeDescriptor[]): number {
  return nodes.reduce((count, node) => count + 1 + countNodes(node.children), 0);
}

function splitHierarchyRoots(roots: DebugNodeDescriptor[]): { persistentManagers: DebugNodeDescriptor[]; scenes: DebugNodeDescriptor[] } {
  const appRoot = roots.find(isAppRootNode);
  return {
    persistentManagers: roots.filter((node) => !isAppRootNode(node)),
    scenes: appRoot?.children ?? [],
  };
}

function collectNodeIds(nodes: DebugNodeDescriptor[]): string[] {
  return nodes.flatMap((node) => [node.id, ...collectNodeIds(node.children)]);
}

function findPublicDirectory(root: PublicFileEntry, path: string): PublicFileEntry | undefined {
  if (root.kind !== 'directory') return undefined;
  if (root.path === path) return root;
  for (const child of root.children ?? []) {
    if (child.kind !== 'directory') continue;
    const match = findPublicDirectory(child, path);
    if (match) return match;
  }
  return undefined;
}

function findPublicFile(root: PublicFileEntry | undefined, path: string): PublicFileEntry | undefined {
  if (!root) return undefined;
  if (root.kind === 'file') return root.path === path ? root : undefined;
  for (const child of root.children ?? []) {
    const match = findPublicFile(child, path);
    if (match) return match;
  }
  return undefined;
}

function findPublicDirectoryInRoots(roots: PublicFileEntry[], path: string): PublicFileEntry | undefined {
  for (const root of roots) {
    const match = findPublicDirectory(root, path);
    if (match) return match;
  }
  return undefined;
}

function findPublicFileInRoots(roots: PublicFileEntry[], path: string): PublicFileEntry | undefined {
  for (const root of roots) {
    const match = findPublicFile(root, path);
    if (match) return match;
  }
  return undefined;
}

function countPublicFiles(entry: PublicFileEntry): number {
  if (entry.kind === 'file') return 1;
  return (entry.children ?? []).reduce((sum, child) => sum + countPublicFiles(child), 0);
}

function compactPublicPath(path: string): string {
  return path.replace(/^apps\/game\//, '');
}

function publicDirectoryAncestorPaths(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  const ancestors: string[] = [];
  for (let index = 1; index < parts.length; index += 1) ancestors.push(parts.slice(0, index).join('/'));
  return ancestors.filter((ancestor) => ancestor.startsWith('apps/game/public') || ancestor.startsWith('apps/game/src'));
}

function publicFileContentUrl(file: PublicFileEntry): string {
  return editorApi(`/public-files/content?path=${encodeURIComponent(file.path)}`);
}

function publicFileThumbnailUrl(file: PublicFileEntry): string {
  return editorApi(`/public-files/thumbnail?size=128&path=${encodeURIComponent(file.path)}`);
}

function findAtlasMetadataFile(root: PublicFileEntry, imageFile: PublicFileEntry): PublicFileEntry | undefined {
  const candidates = atlasMetadataCandidatePaths(imageFile.path);
  for (const path of candidates) {
    const match = findPublicFile(root, path);
    if (match) return match;
  }
  return undefined;
}

function atlasMetadataCandidatePaths(imagePath: string): string[] {
  const slash = imagePath.lastIndexOf('/');
  const directory = slash >= 0 ? imagePath.slice(0, slash + 1) : '';
  const name = slash >= 0 ? imagePath.slice(slash + 1) : imagePath;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return [`${imagePath}.json`, `${directory}${stem}.json`, `${directory}${stem}_atlas.json`];
}

function parseAtlasFrames(value: unknown): PublicAtlasFrame[] {
  if (!isObjectRecord(value)) return [];
  const tileSize = typeof value.tile_size === 'number' ? value.tile_size : undefined;
  const frames = value.frames;
  if (isObjectRecord(frames)) {
    return Object.entries(frames).flatMap(([id, rect]) => parseAtlasRect(id, id, rect, tileSize));
  }
  if (Array.isArray(frames)) {
    return frames.flatMap((frame, index) => parseAtlasRect(String(index), `frame_${String(index).padStart(3, '0')}`, frame, tileSize));
  }
  const tiles = value.tiles;
  if (isObjectRecord(tiles)) {
    return Object.entries(tiles).flatMap(([id, rect]) => parseAtlasRect(id, id, rect, tileSize));
  }
  return [];
}

function parseAtlasRect(id: string, label: string, value: unknown, tileSize?: number): PublicAtlasFrame[] {
  if (!isObjectRecord(value)) return [];
  if (typeof value.x === 'number' && typeof value.y === 'number' && typeof value.width === 'number' && typeof value.height === 'number') {
    return [{ id, label, rect: { x: value.x, y: value.y, width: value.width, height: value.height } }];
  }
  const px = Array.isArray(value.px_coords) ? value.px_coords : undefined;
  const size = typeof value.tile_size === 'number' ? value.tile_size : tileSize;
  if (px && typeof px[0] === 'number' && typeof px[1] === 'number' && typeof size === 'number') {
    return [{ id, label, rect: { x: px[0], y: px[1], width: size, height: size } }];
  }
  return [];
}

function isNodeFile(file: PublicFileEntry): boolean {
  return file.kind === 'file'
    && (file.path.startsWith('apps/game/src/') || file.path.startsWith('apps/game/public/dynamic-nodes/'))
    && ['ts', 'tsx'].includes(file.extension ?? '');
}

function isDynamicNodeFile(file: PublicFileEntry): boolean {
  return file.kind === 'file' && file.path.startsWith('apps/game/public/dynamic-nodes/') && /\.node\.tsx?$/.test(file.name);
}

function readDynamicNodeDragFile(event: ReactDragEvent): PublicFileEntry | undefined {
  const raw = event.dataTransfer.getData(dynamicNodeDragMimeType);
  if (!raw) return undefined;
  try {
    const file = JSON.parse(raw) as PublicFileEntry;
    return isDynamicNodeFile(file) ? file : undefined;
  } catch {
    return undefined;
  }
}

function compiledPathForDynamicModule(module: { url?: string; source: string }): string {
  if (module.url) return `apps/game/public/${module.url.replace(/^\/+/, '')}`;
  const fileName = module.source.split('/').at(-1)?.replace(/\.node\.tsx?$/, '') ?? 'dynamic-node';
  throw new Error(`Compiled URL fehlt für ${fileName}. Manifest/Drag-Daten sind unvollständig.`);
}

function defaultDynamicNodeName(entry: DynamicNodeManifestEntry): string {
  const base = entry.source.split('/').at(-1)?.replace(/\.node\.tsx?$/, '') ?? entry.nodeTypeId ?? 'DynamicNode';
  return base.split(/[-_]/).filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' ');
}

function isPublicJsonFile(file: PublicFileEntry): boolean {
  return file.kind === 'file' && file.path.startsWith('apps/game/public/') && file.extension === 'json';
}

function isCodePreviewFile(file: PublicFileEntry): boolean {
  return isNodeFile(file) || isPublicJsonFile(file);
}

async function loadEditorSourceFile(path: string, signal: AbortSignal): Promise<NodeSourceFileContent> {
  if (path.startsWith('apps/game/src/') || path.startsWith('apps/game/public/dynamic-nodes/')) {
    const response = await fetch(nodeFileContentUrl(path), { cache: 'no-store', headers: { Accept: 'application/json' }, signal });
    const result = await response.json() as NodeSourceFileContent & { error?: string };
    if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
    return result;
  }

  const response = await fetch(publicFileContentPathUrl(path), { cache: 'no-store', headers: { Accept: 'application/json, text/plain' }, signal });
  const content = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${content.slice(0, 120)}`);
  return { path, content, modifiedAt: 0, size: content.length };
}

function editorLanguageForPath(path: string): string {
  if (path.endsWith('.json')) return 'json';
  return 'typescript';
}

function nodeFileContentUrl(path: string): string {
  return editorApi(`/node-files/content?path=${encodeURIComponent(path)}`);
}

function publicFileContentPathUrl(path: string): string {
  return editorApi(`/public-files/content?path=${encodeURIComponent(path)}`);
}

function isImageFile(file: PublicFileEntry): boolean {
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(file.extension ?? '');
}

function isAudioFile(file: PublicFileEntry): boolean {
  return ['wav', 'mp3', 'ogg'].includes(file.extension ?? '');
}

function formatFileMeta(file: PublicFileEntry): string {
  const size = formatFileSize(file.size ?? 0);
  return file.extension ? `${file.extension.toUpperCase()} · ${size}` : size;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function findNodePath(nodes: DebugNodeDescriptor[], id: string, parentPath: string[] = []): string[] | undefined {
  for (const node of nodes) {
    const path = isAppRootNode(node) ? parentPath : [...parentPath, node.name];
    if (node.id === id) return path;
    const childPath = findNodePath(node.children, id, path);
    if (childPath) return childPath;
  }
  return undefined;
}

function findNodeByPath(nodes: DebugNodeDescriptor[], path: string[], parentPath: string[] = []): DebugNodeDescriptor | undefined {
  for (const node of nodes) {
    const currentPath = isAppRootNode(node) ? parentPath : [...parentPath, node.name];
    if (currentPath.length === path.length && currentPath.every((part, index) => part === path[index])) return node;
    const child = findNodeByPath(node.children, path, currentPath);
    if (child) return child;
  }
  return undefined;
}

function removeInactiveNodeIds(expanded: Set<string>, nodes: DebugNodeDescriptor[]): void {
  for (const node of nodes) {
    if (!isEffectivelyActive(node)) expanded.delete(node.id);
    removeInactiveNodeIds(expanded, node.children);
  }
}

function isEffectivelyActive(node: DebugNodeDescriptor): boolean {
  return node.effectiveActive ?? node.active;
}

function reconcileExpandedNodeIds(expanded: ReadonlySet<string>, roots: DebugNodeDescriptor[], deltas: DebugNodeDelta[]): Set<string> {
  const existingIds = new Set(collectNodeIds(roots));
  const next = new Set([...expanded].filter((id) => existingIds.has(id)));

  for (const delta of deltas) {
    if (delta.kind === 'added' && delta.node && isEffectivelyActive(delta.node)) next.add(delta.id);
  }

  removeInactiveNodeIds(next, roots);
  return next;
}

function applyNodeDeltas(roots: DebugNodeDescriptor[], deltas: DebugNodeDelta[]): DebugNodeDescriptor[] {
  const clonedRoots = cloneTree(roots);

  for (const delta of deltas) {
    if (delta.kind === 'removed') removeNode(clonedRoots, delta.id);
    if (delta.kind === 'added' && delta.node) insertNode(clonedRoots, delta.node, delta.parentId, delta.index);
    if (delta.kind === 'moved') moveNode(clonedRoots, delta.id, delta.parentId, delta.index);
    if (delta.kind === 'updated') updateNode(clonedRoots, delta.id, delta.node ?? { active: delta.active, visible: delta.visible });
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
