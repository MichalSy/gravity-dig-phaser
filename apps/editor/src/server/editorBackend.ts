import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import ts from 'typescript';
import type { DebugNodeMovePlacement, DebugNodePatch, EditorAddNodeChange, EditorChange, EditorChangeSet, EditorMoveNodeChange, EditorSetPropsChange } from '@gravity-dig/debug-protocol';

interface SaveRequest {
  message?: string;
  authorName?: string;
  authorEmail?: string;
}

export interface EditorGitDiffFile {
  path: string;
  status: string;
  original: string;
  modified: string;
}

interface StagedAssetUpload {
  id: string;
  sessionId: string;
  assetPath: string;
  uploadPath: string;
  createdAt: number;
}

export class EditorBackendError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

interface SceneNodeJsonLike {
  name?: string;
  nodeTypeId?: string;
  id?: string;
  prefab?: string;
  props?: Record<string, unknown>;
  children?: SceneNodeJsonLike[];
}

export interface PublicFileEntry {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  size?: number;
  modifiedAt?: number;
  extension?: string;
  children?: PublicFileEntry[];
}

const execFileAsync = promisify(execFile);
const changeSets = new Map<string, EditorChangeSet>();
const assetUploads = new Map<string, StagedAssetUpload[]>();

const gitRepoUrl = process.env.EDITOR_GIT_REPO ?? 'https://github.com/MichalSy/gravity-dig-phaser.git';
const gitBranch = process.env.EDITOR_GIT_BRANCH ?? 'main';
const workspacePath = resolve(/* turbopackIgnore: true */ process.env.EDITOR_WORKSPACE ?? '/tmp/gravity-dig-phaser-editor-workspace');
const workspaceLockPath = `${workspacePath}.lock`;
const defaultAuthorName = process.env.EDITOR_GIT_AUTHOR_NAME ?? 'Gravity Dig Editor';
const defaultAuthorEmail = process.env.EDITOR_GIT_AUTHOR_EMAIL ?? 'editor@gravity-dig.local';
const uploadRoot = resolve(/* turbopackIgnore: true */ process.env.EDITOR_UPLOAD_WORKSPACE ?? '/tmp/gravity-dig-editor-uploads');
const allowedRepoRoots = parseAllowedRepoRoots(process.env.EDITOR_ALLOWED_REPO_ROOTS, workspacePath);

const editableFileRoots = [
  'apps/game/public/scenes',
  'apps/game/public/prefabs',
  'apps/game/public/config',
  'apps/game/public/assets',
  'apps/game/public/scripts',
].map((path) => path.replaceAll('/', sep));
const gitEditorRoots = [...editableFileRoots, `apps${sep}game${sep}src`];
const gitEditorRootArgs = gitEditorRoots.map((path) => path.split(sep).join('/'));

type WorkspaceActivityPhase = 'ready' | 'cloning' | 'fetching' | 'syncing' | 'building-dynamic-nodes';

const workspaceActivity: { phase: WorkspaceActivityPhase; message: string; busy: boolean; startedAt?: number; updatedAt: number } = {
  phase: 'ready',
  message: 'Workspace bereit.',
  busy: false,
  updatedAt: Date.now(),
};

function setWorkspaceActivity(phase: WorkspaceActivityPhase, message: string, busy: boolean): void {
  const now = Date.now();
  workspaceActivity.phase = phase;
  workspaceActivity.message = message;
  workspaceActivity.busy = busy;
  workspaceActivity.startedAt = busy ? now : undefined;
  workspaceActivity.updatedAt = now;
}

export function backendStatus() {
  return {
    ok: true,
    service: 'gravity-dig-debug-editor',
    git: {
      enabled: Boolean(process.env.GITHUB_TOKEN),
      workspacePath,
      allowedRepoRoots,
      gitRepoUrl: redactRepoUrl(gitRepoUrl),
      gitBranch,
    },
    workspace: {
      path: workspacePath,
      exists: existsSync(join(workspacePath, '.git')),
      ...workspaceActivity,
    },
    sessions: [...new Set([...changeSets.keys(), ...assetUploads.keys()])].map((sessionId) => ({
      sessionId,
      changes: changeSets.get(sessionId)?.changes.length ?? 0,
      assetUploads: assetUploads.get(sessionId)?.length ?? 0,
      updatedAt: changeSets.get(sessionId)?.updatedAt,
      baseRevision: changeSets.get(sessionId)?.baseRevision,
    })),
  };
}

export function readChangeSet(sessionId: string): EditorChangeSet {
  return changeSets.get(sessionId) ?? { sessionId, changes: [] };
}

export async function appendChangesFromBody(sessionId: string, body: unknown): Promise<{ accepted: EditorChange[]; changeSet: EditorChangeSet }> {
  const typed = body as Partial<EditorChange> | { changes?: Partial<EditorChange>[] } | undefined;
  const incoming = Array.isArray((typed as { changes?: unknown })?.changes) ? (typed as { changes: Partial<EditorChange>[] }).changes : [typed as Partial<EditorChange> | undefined];
  const accepted = incoming.map((change) => normalizeEditorChange(sessionId, change)).filter((change): change is EditorChange => Boolean(change));
  if (accepted.length === 0) throw new EditorBackendError('No valid editor changes. Required: kind=setProps, kind=moveNode or kind=addNode.', 400);
  await withWorkspaceLock(async () => {
    await ensureWorkspaceUnlocked();
    for (const change of accepted) await applyChangeToWorkspace(change);
  });
  return { accepted, changeSet: appendChanges(sessionId, accepted) };
}

export function clearSession(sessionId: string): void {
  changeSets.delete(sessionId);
  assetUploads.delete(sessionId);
}

export function removePendingProp(sessionId: string, body: unknown): EditorChangeSet {
  const typed = body as { changeId?: unknown; prop?: unknown } | undefined;
  const changeId = typeof typed?.changeId === 'string' ? typed.changeId.trim() : '';
  const prop = typeof typed?.prop === 'string' ? typed.prop.trim() : '';
  if (!changeId || !prop) throw new EditorBackendError('Required: changeId and prop.', 400);

  const current = readChangeSet(sessionId);
  const changes = current.changes.flatMap((change) => {
    if (change.kind !== 'setProps' || change.id !== changeId) return [change];
    const props = { ...change.props };
    const previousProps = { ...(change.previousProps ?? {}) };
    delete props[prop];
    delete previousProps[prop];
    return Object.keys(props).length > 0 ? [{ ...change, props, previousProps }] : [];
  });
  const next: EditorChangeSet = { ...current, changes, updatedAt: Date.now() };
  if (changes.length === 0) changeSets.delete(sessionId);
  else changeSets.set(sessionId, next);
  return readChangeSet(sessionId);
}

export async function saveChangesToGit(sessionId: string, request: SaveRequest) {
  return pushGitChanges(sessionId, request);
}

export async function pushGitChanges(sessionId: string, request: SaveRequest) {
  return withWorkspaceLock(async () => {
    await ensureWorkspaceUnlocked();
    const uploads = assetUploads.get(sessionId) ?? [];
    for (const upload of uploads) await applyAssetUploadToWorkspace(upload);
    await git(['diff', '--check']);
    const status = (await git(['status', '--short', '--', ...gitEditorRootArgs])).trim();
    if (!status) return { sessionId, saved: false, message: 'No local changes.' };
    await git(['config', 'user.name', request.authorName ?? defaultAuthorName]);
    await git(['config', 'user.email', request.authorEmail ?? defaultAuthorEmail]);
    await git(['add', ...gitEditorRootArgs]);
    const stagedStatus = (await git(['diff', '--cached', '--name-only'])).trim();
    if (!stagedStatus) return { sessionId, saved: false, message: 'No staged editor changes.' };
    const fileCount = stagedStatus.split('\n').filter(Boolean).length;
    await git(['commit', '-m', request.message?.trim() || `editor: update ${fileCount} file${fileCount === 1 ? '' : 's'}`]);
    const commit = (await git(['rev-parse', '--short', 'HEAD'])).trim();
    await pushWithRebase();
    clearSession(sessionId);
    return { sessionId, saved: true, commit, files: status.split('\n') };
  });
}

export async function discardLocalChanges() {
  return withWorkspaceLock(async () => {
    await ensureWorkspaceUnlocked();
    await git(['restore', '--worktree', '--staged', ...gitEditorRootArgs]);
    await git(['clean', '-fd', '--', ...gitEditorRootArgs]);
    changeSets.clear();
    assetUploads.clear();
    return { ok: true, status: (await git(['status', '--short'])).trim().split('\n').filter(Boolean) };
  });
}

export async function gitDiff() {
  return withWorkspaceLock(async () => {
    await ensureWorkspaceUnlocked();
    const raw = (await git(['status', '--short', '--', ...gitEditorRootArgs])).trim();
    const files = raw.split('\n').filter(Boolean).map(parseGitStatusLine);
    return { ok: true, files };
  });
}

export async function gitDiffFile(relativePath: string): Promise<EditorGitDiffFile> {
  return withWorkspaceLock(async () => {
    await ensureWorkspaceUnlocked();
    const safePath = resolveGitDiffPath(relativePath);
    const path = safePath.relativePath;
    const statusLine = (await git(['status', '--short', '--', path])).trim();
    const status = statusLine ? parseGitStatusLine(statusLine).status : 'M';
    const original = await git(['show', `HEAD:${path}`]).catch(() => '');
    const modified = await readFile(safePath.absolutePath, 'utf8').catch(() => '');
    return { path, status, original, modified };
  });
}

export async function gitStatus() {
  return withWorkspaceLock(async () => {
    await ensureWorkspaceUnlocked();
    setWorkspaceActivity('fetching', 'Git-Status wird geprüft ...', true);
    let divergence: { ahead: number; behind: number };
    try {
      await git(['fetch', 'origin', gitBranch]);
      divergence = await branchDivergence();
    } finally {
      setWorkspaceActivity('ready', 'Git-Workspace bereit.', false);
    }
    return {
      ok: true,
      branch: gitBranch,
      head: (await git(['rev-parse', '--short', 'HEAD'])).trim(),
      originHead: (await git(['rev-parse', '--short', `origin/${gitBranch}`])).trim(),
      status: (await git(['status', '--short', '--', ...gitEditorRootArgs])).trim().split('\n').filter(Boolean),
      ...divergence,
      needsRebase: divergence.behind > 0,
    };
  });
}

export async function readEditorFile(relativePath: string) {
  await ensureWorkspace();
  const safePath = resolveEditablePath(relativePath);
  return { path: safePath.relativePath, content: await readFile(safePath.absolutePath, 'utf8') };
}

export async function listPublicFiles(): Promise<{ root: PublicFileEntry }> {
  const rootPath = await ensurePublicRoot();
  const root = await readPublicDirectory(rootPath, 'apps/game/public');
  return { root: { ...root, name: 'public', path: 'apps/game/public' } };
}

export async function listPublicDirectories(): Promise<{ root: PublicFileEntry }> {
  const rootPath = await ensurePublicRoot();
  const root = await readDirectoryStructure(rootPath, 'apps/game/public', { hidePublicEntries: true });
  return { root: { ...root, name: 'public', path: 'apps/game/public' } };
}

export async function listPublicDirectoryFiles(relativePath: string): Promise<{ path: string; files: PublicFileEntry[] }> {
  const rootPath = await ensurePublicRoot();
  const directory = resolvePublicDirectoryPath(rootPath, relativePath);
  return { path: directory.relativePath, files: await readDirectPublicFiles(directory.absolutePath, directory.relativePath) };
}

export async function listNodeFiles(): Promise<{ root: PublicFileEntry }> {
  const sourceRootPath = await ensureNodeRoot();
  const sourceRoot = await readNodeDirectory(sourceRootPath, 'apps/game/src');
  const dynamicRootPath = await ensureDynamicNodeRoot();
  const dynamicRoot = await readNodeDirectory(dynamicRootPath, 'apps/game/public/scripts');
  const children = [
    ...(sourceRoot.children ?? []),
    ...(dynamicRoot.children && dynamicRoot.children.length > 0 ? [dynamicRoot] : []),
  ];
  return { root: { name: 'Nodes', path: 'apps/game', kind: 'directory', children } };
}

export async function listNodeDirectories(): Promise<{ root: PublicFileEntry }> {
  const sourceRootPath = await ensureNodeRoot();
  const sourceRoot = await readDirectoryStructure(sourceRootPath, 'apps/game/src');
  const dynamicRootPath = await ensureDynamicNodeRoot();
  const dynamicRoot = await readDirectoryStructure(dynamicRootPath, 'apps/game/public/scripts');
  return { root: { name: 'Nodes', path: 'apps/game', kind: 'directory', children: [...(sourceRoot.children ?? []), dynamicRoot] } };
}

export async function listNodeDirectoryFiles(relativePath: string): Promise<{ path: string; files: PublicFileEntry[] }> {
  const directory = await resolveNodeDirectoryPath(relativePath);
  return { path: directory.relativePath, files: await readDirectNodeFiles(directory.absolutePath, directory.relativePath) };
}

export async function readNodeFile(relativePath: string): Promise<{ path: string; content: string; modifiedAt: number; size: number }> {
  const filePath = await resolveNodeFilePath(relativePath);
  const fileStat = await stat(filePath.absolutePath);
  return { path: filePath.relativePath, content: await readFile(filePath.absolutePath, 'utf8'), modifiedAt: fileStat.mtimeMs, size: fileStat.size };
}

export async function readPublicFile(relativePath: string): Promise<{ content: Buffer; contentType: string; path: string; size: number }> {
  const filePath = await resolvePublicFilePath(relativePath);
  const content = await readFile(filePath.absolutePath);
  return { content, contentType: contentTypeForPath(filePath.relativePath), path: filePath.relativePath, size: content.length };
}

export async function writeEditorFile(relativePath: string, content: string) {
  await ensureWorkspace();
  const safePath = resolveEditablePath(relativePath);
  await mkdir(dirname(safePath.absolutePath), { recursive: true });
  await writeFile(safePath.absolutePath, content);
  const dynamicNodeBuild = isDynamicNodeSourcePath(safePath.relativePath) ? await buildDynamicNodeModules() : undefined;
  return { ok: true, path: safePath.relativePath, dynamicNodeBuild };
}

export async function stageAssetUpload(sessionId: string, body: unknown) {
  const typed = body as { assetPath?: string; contentBase64?: string } | undefined;
  if (!typed?.assetPath || !typed.contentBase64) throw new EditorBackendError('Required: assetPath and contentBase64', 400);
  const normalizedAssetPath = normalizeAssetPath(typed.assetPath);
  if (!normalizedAssetPath) throw new EditorBackendError('assetPath must point inside apps/game/public/assets or public/assets', 400);
  const uploadPath = resolve(uploadRoot, sessionId, normalizedAssetPath);
  assertInsideRoot(uploadPath, uploadRoot, 'uploadPath');
  await mkdir(dirname(uploadPath), { recursive: true });
  await writeFile(uploadPath, Buffer.from(typed.contentBase64, 'base64'));
  const staged: StagedAssetUpload = { id: randomUUID(), sessionId, assetPath: normalizedAssetPath, uploadPath, createdAt: Date.now() };
  assetUploads.set(sessionId, [...(assetUploads.get(sessionId) ?? []).filter((upload) => upload.assetPath !== normalizedAssetPath), staged]);
  return { ok: true, sessionId, upload: { id: staged.id, assetPath: staged.assetPath, createdAt: staged.createdAt } };
}

function normalizeEditorChange(sessionId: string, change: Partial<EditorChange> | undefined): EditorChange | undefined {
  if (!change || typeof change !== 'object') return undefined;
  if (change.kind === 'setProps') return normalizeSetPropsChange(sessionId, change as Partial<EditorSetPropsChange>);
  if (change.kind === 'moveNode') return normalizeMoveNodeChange(sessionId, change as Partial<EditorMoveNodeChange>);
  if (change.kind === 'addNode') return normalizeAddNodeChange(sessionId, change as Partial<EditorAddNodeChange>);
  return undefined;
}

function normalizeSetPropsChange(sessionId: string, change: Partial<EditorSetPropsChange> | undefined): EditorSetPropsChange | undefined {
  if (!change || change.kind !== 'setProps' || !Array.isArray(change.target?.nodePath) || typeof change.props !== 'object' || change.props === null) return undefined;
  const nodePath = normalizeNodePathInput(change.target.nodePath);
  if (nodePath.length === 0) return undefined;
  return {
    id: change.id ?? randomUUID(),
    kind: 'setProps',
    sessionId,
    target: { nodePath },
    props: change.props as DebugNodePatch,
    previousProps: typeof change.previousProps === 'object' && change.previousProps !== null ? change.previousProps as DebugNodePatch : undefined,
    fieldPath: Array.isArray(change.fieldPath) ? change.fieldPath.map((part) => String(part).trim()).filter(Boolean) : undefined,
    createdAt: change.createdAt ?? Date.now(),
  };
}

function normalizeAddNodeChange(sessionId: string, change: Partial<EditorAddNodeChange> | undefined): EditorAddNodeChange | undefined {
  if (!change || change.kind !== 'addNode' || !Array.isArray(change.target?.nodePath) || typeof change.node !== 'object' || change.node === null) return undefined;
  const nodePath = normalizeNodePathInput(change.target.nodePath);
  if (nodePath.length === 0 || typeof change.node.nodeTypeId !== 'string' || !change.node.nodeTypeId.trim()) return undefined;
  return {
    id: change.id ?? randomUUID(),
    kind: 'addNode',
    sessionId,
    target: { nodePath },
    index: typeof change.index === 'number' && Number.isFinite(change.index) ? Math.max(0, Math.trunc(change.index)) : undefined,
    node: {
      nodeTypeId: change.node.nodeTypeId,
      name: typeof change.node.name === 'string' ? change.node.name : undefined,
      props: typeof change.node.props === 'object' && change.node.props !== null ? change.node.props : undefined,
      children: Array.isArray(change.node.children) ? change.node.children : undefined,
    },
    createdAt: change.createdAt ?? Date.now(),
  };
}

function normalizeMoveNodeChange(sessionId: string, change: Partial<EditorMoveNodeChange> | undefined): EditorMoveNodeChange | undefined {
  if (!change || change.kind !== 'moveNode' || !Array.isArray(change.target?.nodePath) || !Array.isArray(change.destination?.nodePath)) return undefined;
  const nodePath = normalizeNodePathInput(change.target.nodePath);
  const targetPath = normalizeNodePathInput(change.destination.nodePath);
  const placement = change.destination.placement;
  if (nodePath.length === 0 || targetPath.length === 0 || !isMovePlacement(placement)) return undefined;
  return {
    id: change.id ?? randomUUID(),
    kind: 'moveNode',
    sessionId,
    target: { nodePath },
    destination: { nodePath: targetPath, placement },
    createdAt: change.createdAt ?? Date.now(),
  };
}

function normalizeNodePathInput(nodePath: readonly unknown[]): string[] {
  return nodePath.map((part) => String(part).trim()).filter(Boolean);
}

function isMovePlacement(value: unknown): value is DebugNodeMovePlacement {
  return value === 'before' || value === 'after' || value === 'child';
}

function appendChanges(sessionId: string, changes: EditorChange[]): EditorChangeSet {
  const current = readChangeSet(sessionId);
  const byProp = new Map<string, EditorSetPropsChange>();

  const moveChanges = current.changes.filter((change): change is EditorMoveNodeChange => change.kind === 'moveNode');
  const addChanges = current.changes.filter((change): change is EditorAddNodeChange => change.kind === 'addNode');

  for (const change of current.changes) {
    if (change.kind !== 'setProps') continue;
    const prop = singlePropName(change);
    if (prop) byProp.set(changeKey(change.target.nodePath, prop, singleFieldName(change)), change);
  }

  for (const incoming of changes.filter((change): change is EditorSetPropsChange => change.kind === 'setProps').flatMap(splitChangeByProp)) {
    const prop = singlePropName(incoming);
    if (!prop) continue;
    const field = singleFieldName(incoming);
    const key = changeKey(incoming.target.nodePath, prop, field);
    const existing = byProp.get(key);
    const previousValue = existing?.previousProps && prop in existing.previousProps ? existing.previousProps[prop] : incoming.previousProps?.[prop];
    const nextValue = incoming.props[prop];

    if (previousValue !== undefined && scenePropValuesEqual(fieldValue(nextValue, field), fieldValue(previousValue, field))) {
      byProp.delete(key);
      continue;
    }

    byProp.set(key, {
      ...incoming,
      id: existing?.id ?? incoming.id,
      createdAt: existing?.createdAt ?? incoming.createdAt,
      previousProps: previousValue !== undefined ? { [prop]: previousValue } : undefined,
    });
  }

  const incomingMoves = changes.filter((change): change is EditorMoveNodeChange => change.kind === 'moveNode');
  const incomingAdds = changes.filter((change): change is EditorAddNodeChange => change.kind === 'addNode');
  const nextMoves = [...moveChanges, ...incomingMoves];
  const nextAdds = [...addChanges, ...incomingAdds];
  const next: EditorChangeSet = { ...current, sessionId, changes: [...byProp.values(), ...nextMoves, ...nextAdds], updatedAt: Date.now() };
  if (next.changes.length === 0) changeSets.delete(sessionId);
  else changeSets.set(sessionId, next);
  return readChangeSet(sessionId);
}

function splitChangeByProp(change: EditorSetPropsChange): EditorSetPropsChange[] {
  return Object.entries(change.props).flatMap<EditorSetPropsChange>(([prop, value]) => {
    const previousValue = change.previousProps?.[prop];
    if (isObjectPropValue(value)) {
      const objectValue = value as Record<string, unknown>;
      const previousObject = isObjectPropValue(previousValue) ? previousValue as Record<string, unknown> : undefined;
      return Object.keys(objectValue).flatMap((field) => {
        if (previousObject && field in previousObject && scenePropValuesEqual(objectValue[field], previousObject[field])) return [];
        return [{
          ...change,
          id: randomUUID(),
          props: { [prop]: value } as DebugNodePatch,
          previousProps: previousObject ? { [prop]: previousObject } as DebugNodePatch : undefined,
          fieldPath: [field],
        }];
      });
    }
    return [{
      ...change,
      id: randomUUID(),
      props: { [prop]: value } as DebugNodePatch,
      previousProps: change.previousProps && prop in change.previousProps ? { [prop]: previousValue } as DebugNodePatch : undefined,
      fieldPath: undefined,
    }];
  });
}

function singlePropName(change: EditorSetPropsChange): string | undefined {
  const props = Object.keys(change.props);
  return props.length === 1 ? props[0] : undefined;
}

function singleFieldName(change: EditorSetPropsChange): string | undefined {
  return change.fieldPath?.length === 1 ? change.fieldPath[0] : undefined;
}

function changeKey(nodePath: string[], prop: string, field?: string): string {
  return `${nodePath.join('\u0000')}\u0000${prop}\u0000${field ?? ''}`;
}

function fieldValue(value: DebugNodePatch[string], field?: string): unknown {
  if (!field || !isObjectPropValue(value)) return value;
  return (value as Record<string, unknown>)[field];
}

function isObjectPropValue(value: unknown): value is Record<string, DebugNodePatch[string]> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scenePropValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function withWorkspaceLock<T>(operation: () => Promise<T>): Promise<T> {
  await acquireWorkspaceLock();
  try {
    await recoverStaleGitIndexLock();
    return await operation();
  } finally {
    await rm(workspaceLockPath, { recursive: true, force: true });
  }
}

async function acquireWorkspaceLock(): Promise<void> {
  const startedAt = Date.now();
  while (true) {
    try {
      await mkdir(workspaceLockPath, { recursive: false });
      return;
    } catch (error) {
      if (!isFileSystemError(error) || error.code !== 'EEXIST') throw error;
      if (Date.now() - startedAt > 30_000) throw new EditorBackendError('Editor workspace is busy. Bitte gleich nochmal versuchen.', 503);
      await removeStaleDirectoryLock(workspaceLockPath, 30_000);
      await sleep(100);
    }
  }
}

async function removeStaleDirectoryLock(lockPath: string, maxAgeMs: number): Promise<void> {
  try {
    const lockStat = await stat(lockPath);
    if (Date.now() - lockStat.mtimeMs > maxAgeMs) await rm(lockPath, { recursive: true, force: true });
  } catch (error) {
    if (!isFileSystemError(error) || error.code !== 'ENOENT') throw error;
  }
}

async function recoverStaleGitIndexLock(): Promise<void> {
  const indexLockPath = join(workspacePath, '.git', 'index.lock');
  if (!existsSync(indexLockPath)) return;
  const startedAt = Date.now();
  while (existsSync(indexLockPath)) {
    const lockStat = await stat(indexLockPath);
    const ageMs = Date.now() - lockStat.mtimeMs;
    if (ageMs > 30_000) {
      await unlink(indexLockPath);
      console.warn('[git] removed stale index.lock', indexLockPath);
      return;
    }
    if (Date.now() - startedAt > 15_000) throw new EditorBackendError('Editor workspace git index is locked. Bitte gleich nochmal versuchen.', 503);
    await sleep(100);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function isFileSystemError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

async function ensureWorkspace(): Promise<void> {
  await withWorkspaceLock(() => ensureWorkspaceUnlocked());
}

async function ensureWorkspaceUnlocked(): Promise<void> {
  assertAllowedRepoRoot(workspacePath);
  if (existsSync(join(workspacePath, '.git'))) return;
  setWorkspaceActivity('cloning', 'Git-Workspace wird geklont ...', true);
  try {
    await rm(workspacePath, { recursive: true, force: true });
    await mkdir(dirname(workspacePath), { recursive: true });
    await gitOutside(['clone', '--branch', gitBranch, gitRepoUrl, workspacePath]);
  } finally {
    setWorkspaceActivity('ready', existsSync(join(workspacePath, '.git')) ? 'Git-Workspace bereit.' : 'Git-Workspace nicht bereit.', false);
  }
}

async function syncWorkspaceToOriginUnlocked(): Promise<void> {
  setWorkspaceActivity('syncing', 'Git-Workspace wird mit origin/main synchronisiert ...', true);
  try {
    await git(['fetch', 'origin', gitBranch]);
    await git(['checkout', gitBranch]);
    await git(['reset', '--hard', `origin/${gitBranch}`]);
  } finally {
    setWorkspaceActivity('ready', 'Git-Workspace bereit.', false);
  }
}

async function ensurePublicRoot(): Promise<string> {
  return ensureWorkspaceSubtree('apps/game/public', 'Public root');
}

async function ensureNodeRoot(): Promise<string> {
  return ensureWorkspaceSubtree('apps/game/src', 'Node source root');
}

async function ensureDynamicNodeRoot(): Promise<string> {
  return ensureWorkspaceSubtree('apps/game/public/scripts', 'Dynamic node source root');
}

async function ensureWorkspaceSubtree(relativeRoot: string, label: string): Promise<string> {
  return withWorkspaceLock(async () => {
    await ensureWorkspaceUnlocked();
    const rootPath = resolve(workspacePath, relativeRoot);
    assertInsideRoot(rootPath, workspacePath, label);
    if (existsSync(rootPath)) return rootPath;

    await syncWorkspaceToOriginUnlocked();
    if (existsSync(rootPath)) return rootPath;

    await rm(workspacePath, { recursive: true, force: true });
    await ensureWorkspaceUnlocked();
    if (existsSync(rootPath)) return rootPath;

    throw new EditorBackendError(`${label} not found after workspace sync: ${relative(workspacePath, rootPath)}`, 500);
  });
}

async function resolvePublicFilePath(relativePath: string): Promise<{ absolutePath: string; relativePath: string }> {
  const rootPath = await ensurePublicRoot();
  const normalizedPath = relativePath.replace(/^\/+/, '').replaceAll('/', sep);
  if (!normalizedPath || normalizedPath.split(sep).includes('..')) throw new EditorBackendError('Invalid public file path.', 400);
  const fullRelativePath = normalizedPath.startsWith(`apps${sep}game${sep}public${sep}`) ? normalizedPath : join('apps/game/public', normalizedPath);
  const absolutePath = resolve(workspacePath, fullRelativePath);
  assertInsideRoot(absolutePath, rootPath, 'publicFile');
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) throw new EditorBackendError('Public path is not a file.', 400);
  return { absolutePath, relativePath: fullRelativePath };
}

async function resolveNodeFilePath(relativePath: string): Promise<{ absolutePath: string; relativePath: string }> {
  const normalizedPath = relativePath.replace(/^\/+/, '').replaceAll('/', sep);
  if (!normalizedPath || normalizedPath.split(sep).includes('..')) throw new EditorBackendError('Invalid node file path.', 400);
  const fullRelativePath = normalizeNodeFilePath(normalizedPath);
  const rootPath = fullRelativePath.startsWith(`apps${sep}game${sep}public${sep}scripts${sep}`) ? await ensureDynamicNodeRoot() : await ensureNodeRoot();
  const absolutePath = resolve(workspacePath, fullRelativePath);
  assertInsideRoot(absolutePath, rootPath, 'nodeFile');
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) throw new EditorBackendError('Node path is not a file.', 400);
  if (!isNodeSourceFile(fullRelativePath, await readFile(absolutePath, 'utf8'))) throw new EditorBackendError('Node path is not a node source file.', 403);
  return { absolutePath, relativePath: fullRelativePath.split(sep).join('/') };
}

async function branchDivergence(): Promise<{ ahead: number; behind: number }> {
  const output = (await git(['rev-list', '--left-right', '--count', `HEAD...origin/${gitBranch}`])).trim();
  const [aheadRaw, behindRaw] = output.split(/\s+/);
  return { ahead: Number(aheadRaw) || 0, behind: Number(behindRaw) || 0 };
}

async function pushWithRebase(): Promise<void> {
  try {
    await git(['pushWithToken', 'origin', gitBranch]);
    return;
  } catch {
    await git(['fetch', 'origin', gitBranch]);
    await git(['rebase', `origin/${gitBranch}`]);
    await git(['pushWithToken', 'origin', gitBranch]);
  }
}

async function applyChangeToWorkspace(change: EditorChange): Promise<void> {
  if (change.kind === 'moveNode') {
    await applyMoveNodeToWorkspace(change);
    return;
  }
  if (change.kind === 'addNode') {
    await applyAddNodeToWorkspace(change);
    return;
  }
  const source = resolveSourceFile(change.target.nodePath);
  const filePath = resolveEditablePath(source.filePath);
  const file = JSON.parse(await readFile(filePath.absolutePath, 'utf8')) as { root: SceneNodeJsonLike };
  const node = findNodeByPath(file.root, source.nodePath);
  if (!node) throw new EditorBackendError(`Could not locate node path '${change.target.nodePath.join('/')}' in ${source.filePath}`, 422);
  node.props = { ...(node.props ?? {}) };
  for (const [key, value] of Object.entries(change.props)) {
    const field = singleFieldName(change);
    if (value === null) {
      delete node.props[key];
    } else if (field && isObjectPropValue(value)) {
      const currentValue = isObjectPropValue(node.props[key]) ? node.props[key] : {};
      node.props[key] = { ...currentValue, [field]: (value as Record<string, unknown>)[field] };
    } else {
      node.props[key] = value;
    }
  }
  await writeFile(filePath.absolutePath, `${JSON.stringify(file, null, 2)}\n`);
}


async function applyAddNodeToWorkspace(change: EditorAddNodeChange): Promise<void> {
  const source = resolveSourceFile(change.target.nodePath);
  const filePath = resolveEditablePath(source.filePath);
  const file = JSON.parse(await readFile(filePath.absolutePath, 'utf8')) as { root: SceneNodeJsonLike };
  const parent = findNodeByPath(file.root, source.nodePath);
  if (!parent) throw new EditorBackendError(`Could not locate parent node path '${change.target.nodePath.join('/')}' in ${source.filePath}`, 422);

  const children = [...(parent.children ?? [])];
  const insertIndex = change.index === undefined ? children.length : Math.max(0, Math.min(children.length, Math.trunc(change.index)));
  children.splice(insertIndex, 0, sanitizeSceneNode(change.node));
  parent.children = children;
  await writeFile(filePath.absolutePath, `${JSON.stringify(file, null, 2)}\n`);
}

function sanitizeSceneNode(node: EditorAddNodeChange['node']): SceneNodeJsonLike {
  const sanitized: SceneNodeJsonLike = {
    name: node.name,
    nodeTypeId: node.nodeTypeId,
  };
  if (node.props && Object.keys(node.props).length > 0) sanitized.props = node.props;
  const children = node.children?.filter(isSceneNodeJsonLike).map(sanitizeSceneNode);
  if (children && children.length > 0) sanitized.children = children;
  return sanitized;
}

function isSceneNodeJsonLike(value: unknown): value is EditorAddNodeChange['node'] {
  return typeof value === 'object' && value !== null && typeof (value as { nodeTypeId?: unknown }).nodeTypeId === 'string';
}

async function applyMoveNodeToWorkspace(change: EditorMoveNodeChange): Promise<void> {
  const source = resolveSourceFile(change.target.nodePath);
  const destination = resolveSourceFile(change.destination.nodePath);
  if (source.filePath !== destination.filePath) throw new EditorBackendError('Hierarchy move across source files is not supported yet.', 422);

  const filePath = resolveEditablePath(source.filePath);
  const file = JSON.parse(await readFile(filePath.absolutePath, 'utf8')) as { root: SceneNodeJsonLike };
  const nodeLocation = findNodeLocationByPath(file.root, source.nodePath);
  const destinationLocation = findNodeLocationByPath(file.root, destination.nodePath);
  if (!nodeLocation?.parent) throw new EditorBackendError(`Could not locate movable node path '${change.target.nodePath.join('/')}' in ${source.filePath}`, 422);
  if (!destinationLocation) throw new EditorBackendError(`Could not locate move destination '${change.destination.nodePath.join('/')}' in ${destination.filePath}`, 422);
  const movingNode = nodeLocation.node;
  const destinationNode = destinationLocation.node;
  if (movingNode === destinationNode || isDescendantNode(destinationNode, movingNode)) throw new EditorBackendError('Node cannot be moved into itself or its own subtree.', 422);

  const newParent = change.destination.placement === 'child' ? destinationNode : destinationLocation.parent;
  if (!newParent) throw new EditorBackendError('Root-level hierarchy moves are not supported.', 422);
  if (newParent === nodeLocation.parent) {
    const children = [...(nodeLocation.parent.children ?? [])];
    let insertIndex = change.destination.placement === 'child'
      ? 0
      : children.indexOf(destinationNode) + (change.destination.placement === 'after' ? 1 : 0);
    if (insertIndex < 0) throw new EditorBackendError('Move destination index could not be resolved.', 422);
    const [removed] = children.splice(nodeLocation.index, 1);
    if (nodeLocation.index < insertIndex) insertIndex -= 1;
    children.splice(insertIndex, 0, removed);
    nodeLocation.parent.children = children;
  } else {
    const sourceChildren = [...(nodeLocation.parent.children ?? [])];
    const targetChildren = [...(newParent.children ?? [])];
    const [removed] = sourceChildren.splice(nodeLocation.index, 1);
    const insertIndex = change.destination.placement === 'child'
      ? 0
      : targetChildren.indexOf(destinationNode) + (change.destination.placement === 'after' ? 1 : 0);
    if (insertIndex < 0) throw new EditorBackendError('Move destination index could not be resolved.', 422);
    targetChildren.splice(insertIndex, 0, removed);
    nodeLocation.parent.children = sourceChildren;
    newParent.children = targetChildren;
  }
  await writeFile(filePath.absolutePath, `${JSON.stringify(file, null, 2)}\n`);
}

async function applyAssetUploadToWorkspace(upload: StagedAssetUpload): Promise<void> {
  const target = resolveEditablePath(upload.assetPath);
  await mkdir(dirname(target.absolutePath), { recursive: true });
  await writeFile(target.absolutePath, await readFile(upload.uploadPath));
}

async function readDirectoryStructure(absolutePath: string, relativePath: string, options: { hidePublicEntries?: boolean } = {}): Promise<PublicFileEntry> {
  assertInsideRoot(absolutePath, workspacePath, 'directoryPath');
  const entries = await readdir(absolutePath, { withFileTypes: true });
  const children = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !(options.hidePublicEntries && isHiddenPublicExplorerEntry(relativePath, entry.name)))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
    .map((entry) => readDirectoryStructure(join(absolutePath, entry.name), `${relativePath}/${entry.name}`, options)));

  return { name: relativePath.split('/').at(-1) ?? relativePath, path: relativePath, kind: 'directory', children };
}

function resolvePublicDirectoryPath(rootPath: string, relativePath: string): { absolutePath: string; relativePath: string } {
  const normalizedPath = relativePath.replace(/^\/+/, '').replaceAll('/', sep);
  const fullRelativePath = normalizedPath.startsWith(`apps${sep}game${sep}public`) ? normalizedPath : join('apps/game/public', normalizedPath);
  const absolutePath = resolve(workspacePath, fullRelativePath);
  assertInsideRoot(absolutePath, rootPath, 'publicDirectory');
  return { absolutePath, relativePath: fullRelativePath.split(sep).join('/') };
}

async function resolveNodeDirectoryPath(relativePath: string): Promise<{ absolutePath: string; relativePath: string }> {
  const normalizedPath = relativePath.replace(/^\/+/, '').replaceAll('/', sep);
  const fullRelativePath = normalizedPath === `apps${sep}game` ? normalizedPath : normalizeNodeFilePath(normalizedPath);
  if (fullRelativePath === `apps${sep}game`) return { absolutePath: await ensureNodeRoot(), relativePath: 'apps/game' };
  const rootPath = fullRelativePath.startsWith(`apps${sep}game${sep}public${sep}scripts`) ? await ensureDynamicNodeRoot() : await ensureNodeRoot();
  const absolutePath = resolve(workspacePath, fullRelativePath);
  assertInsideRoot(absolutePath, rootPath, 'nodeDirectory');
  return { absolutePath, relativePath: fullRelativePath.split(sep).join('/') };
}

async function readDirectPublicFiles(absolutePath: string, relativePath: string): Promise<PublicFileEntry[]> {
  const entries = await readdir(absolutePath, { withFileTypes: true });
  return Promise.all(entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
    .map(async (entry) => {
      const childAbsolutePath = join(absolutePath, entry.name);
      const fileStat = await stat(childAbsolutePath);
      return { name: entry.name, path: `${relativePath}/${entry.name}`, kind: 'file' as const, size: fileStat.size, modifiedAt: fileStat.mtimeMs, extension: fileExtension(entry.name) };
    }));
}

async function readDirectNodeFiles(absolutePath: string, relativePath: string): Promise<PublicFileEntry[]> {
  const entries = await readdir(absolutePath, { withFileTypes: true });
  const files = await Promise.all(entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
    .map(async (entry): Promise<PublicFileEntry | undefined> => {
      const childAbsolutePath = join(absolutePath, entry.name);
      const childRelativePath = `${relativePath}/${entry.name}`;
      const fileStat = await stat(childAbsolutePath);
      const content = await readFile(childAbsolutePath, 'utf8');
      if (!isNodeSourceFile(childRelativePath, content)) return undefined;
      return { name: entry.name, path: childRelativePath, kind: 'file', size: fileStat.size, modifiedAt: fileStat.mtimeMs, extension: fileExtension(entry.name) };
    }));
  return files.filter((entry): entry is PublicFileEntry => Boolean(entry));
}

async function readPublicDirectory(absolutePath: string, relativePath: string): Promise<PublicFileEntry> {
  assertInsideRoot(absolutePath, workspacePath, 'publicPath');
  const entries = await readdir(absolutePath, { withFileTypes: true });
  const children = await Promise.all(entries
    .filter((entry) => !entry.name.startsWith('.') && !isHiddenPublicExplorerEntry(relativePath, entry.name))
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1;
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
    })
    .map(async (entry): Promise<PublicFileEntry> => {
      const childAbsolutePath = join(absolutePath, entry.name);
      const childRelativePath = `${relativePath}/${entry.name}`;
      if (entry.isDirectory()) return await readPublicDirectory(childAbsolutePath, childRelativePath);
      const fileStat = await stat(childAbsolutePath);
      return {
        name: entry.name,
        path: childRelativePath,
        kind: 'file',
        size: fileStat.size,
        modifiedAt: fileStat.mtimeMs,
        extension: fileExtension(entry.name),
      };
    }));

  return { name: relativePath.split('/').at(-1) ?? relativePath, path: relativePath, kind: 'directory', children };
}

export async function buildDynamicNodeModules(): Promise<{ manifest: { version: 1; nodes: { nodeTypeId: string; source: string; url: string; hash: string }[] } }> {
  setWorkspaceActivity('building-dynamic-nodes', 'Dynamic Node Scripts werden kompiliert ...', true);
  try {
    const sourceDir = await ensureDynamicNodeRoot();
    const outDir = resolve(workspacePath, 'apps/game/public/scripts-compiled');
    assertInsideRoot(sourceDir, workspacePath, 'dynamicNodeSourceDir');
    assertInsideRoot(outDir, workspacePath, 'dynamicNodeOutDir');

    await mkdir(outDir, { recursive: true });
    const files = await findDynamicNodeSourceFiles(sourceDir);
    const manifest: { version: 1; nodes: { nodeTypeId: string; source: string; url: string; hash: string }[] } = { version: 1, nodes: [] };

    for (const file of files) {
      const sourcePath = join(sourceDir, file);
      const source = await readFile(sourcePath, 'utf8');
      const hash = createHash('sha256').update(source).digest('hex').slice(0, 12);
      const baseName = file.replace(/\.node\.tsx?$/, '').replaceAll(sep, '-');
      const outfileName = `${baseName}.${hash}.js`;
      const outfile = join(outDir, outfileName);
      const compiled = transpileDynamicNodeSource(source, baseName);

      await writeFileAtomic(outfile, compiled);
      await writeFileAtomic(`${outfile}.map`, '');

      const declaredNodeTypeId = source.match(/\bid\s*=\s*['"]([^'"]+)['"]/u)?.[1] ?? baseName;
      manifest.nodes.push({ nodeTypeId: declaredNodeTypeId, source: `public/scripts/${file.split(sep).join('/')}`, url: `/scripts-compiled/${outfileName}`, hash });
    }

    await writeFileAtomic(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return { manifest };
  } finally {
    setWorkspaceActivity('ready', 'Git-Workspace bereit.', false);
  }
}

async function writeFileAtomic(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, content);
  await rename(temporaryPath, path);
}

async function findDynamicNodeSourceFiles(directory: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = prefix ? join(prefix, entry.name) : entry.name;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findDynamicNodeSourceFiles(absolutePath, relativePath));
    else if (/\.node\.tsx?$/.test(entry.name)) files.push(relativePath);
  }
  return files.sort();
}

function transpileDynamicNodeSource(source: string, baseName: string): string {
  const transformedSource = toDynamicNodeModuleSource(source, baseName);
  const output = ts.transpileModule(transformedSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      skipLibCheck: true,
      sourceMap: false,
    },
    fileName: `${baseName}.node.ts`,
    reportDiagnostics: true,
  });
  const errors = output.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error) ?? [];
  if (errors.length > 0) throw new EditorBackendError(errors.map(formatTsDiagnostic).join('\n'), 422);
  return output.outputText;
}

function toDynamicNodeModuleSource(source: string, baseName: string): string {
  const withoutApiImport = source.replace(/^\s*import\s+\{\s*ScriptNode\s*,\s*prop\s*\}\s+from\s+['"]@gravity-dig\/dynamic-node['"];?\s*$/mu, dynamicNodeApiSource());
  const namedDefaultClass = withoutApiImport.match(/export\s+default\s+class\s+([A-Za-z_$][\w$]*)/u)?.[1];
  if (namedDefaultClass) {
    return `${withoutApiImport.replace(/export\s+default\s+class\s+([A-Za-z_$][\w$]*)/u, 'class $1')}
${dynamicNodeModuleFooter(namedDefaultClass, baseName)}
`;
  }

  const anonymousDefaultClass = withoutApiImport.replace(/export\s+default\s+class\s+/u, 'const __DynamicScriptClass = class ');
  if (anonymousDefaultClass !== withoutApiImport) return `${anonymousDefaultClass}
${dynamicNodeModuleFooter('__DynamicScriptClass', baseName)}
`;

  throw new EditorBackendError('Dynamic node source must use `export default class ...`.', 422);
}

function dynamicNodeModuleFooter(className: string, baseName: string): string {
  return `
const probe = new ${className}();
const nodeTypeId = typeof probe.id === 'string' && probe.id.length > 0 ? probe.id : '${baseName}';
const displayName = typeof probe.name === 'string' && probe.name.length > 0 ? probe.name : nodeTypeId;
function createBehavior() { return new ${className}(); }
export default { nodeTypeId, displayName, createBehavior };
export { nodeTypeId, displayName, createBehavior };
`;
}

function dynamicNodeApiSource(): string {
  return `
class ScriptNode {
  log(message, ...values) { this.__dynamicNodeContext?.log(message, ...values); }
  getNode(key) { return this.__dynamicNodeContext?.getNode(key); }
  requireNode(key) {
    const node = this.__dynamicNodeContext?.requireNode(key);
    if (!node) throw new Error('Dynamic node context is not initialized');
    return node;
  }
  getNodeById(instanceId) { return this.__dynamicNodeContext?.getNodeById(instanceId); }
  requireNodeById(instanceId) {
    const node = this.__dynamicNodeContext?.requireNodeById(instanceId);
    if (!node) throw new Error('Dynamic node context is not initialized');
    return node;
  }
  getNodesByName(name) { return this.__dynamicNodeContext?.getNodesByName(name) ?? []; }
  getAppVersion() { return this.__dynamicNodeContext?.getAppVersion() ?? '0.0.0'; }
  emit(action) { this.__dynamicNodeContext?.emit(action); }
}
function marker(value, definition) { return { __dynamicNodeProp: true, value, definition }; }
const prop = {
  string: (value, options = {}) => marker(value, { type: 'String', ...options }),
  number: (value, options = {}) => marker(value, { type: 'Number', ...options }),
  boolean: (value, options = {}) => marker(value, { type: 'Boolean', ...options }),
  assetId: (value, options = {}) => marker(value, { type: 'AssetId', ...options }),
};
`;
}

function formatTsDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  return diagnostic.file && typeof diagnostic.start === 'number'
    ? `${diagnostic.file.fileName}:${diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1}: ${message}`
    : message;
}

async function readNodeDirectory(absolutePath: string, relativePath: string): Promise<PublicFileEntry> {
  assertInsideRoot(absolutePath, workspacePath, 'nodePath');
  const entries = await readdir(absolutePath, { withFileTypes: true });
  const children = (await Promise.all(entries
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1;
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
    })
    .map(async (entry): Promise<PublicFileEntry | undefined> => {
      const childAbsolutePath = join(absolutePath, entry.name);
      const childRelativePath = `${relativePath}/${entry.name}`;
      if (entry.isDirectory()) {
        const directory = await readNodeDirectory(childAbsolutePath, childRelativePath);
        return directory.children && directory.children.length > 0 ? directory : undefined;
      }
      const fileStat = await stat(childAbsolutePath);
      const content = await readFile(childAbsolutePath, 'utf8');
      if (!isNodeSourceFile(childRelativePath, content)) return undefined;
      return {
        name: entry.name,
        path: childRelativePath,
        kind: 'file',
        size: fileStat.size,
        modifiedAt: fileStat.mtimeMs,
        extension: fileExtension(entry.name),
      };
    }))).filter((entry): entry is PublicFileEntry => Boolean(entry));

  return { name: relativePath.split('/').at(-1) ?? relativePath, path: relativePath, kind: 'directory', children };
}

function normalizeNodeFilePath(normalizedPath: string): string {
  if (normalizedPath.startsWith(`apps${sep}game${sep}src${sep}`) || normalizedPath.startsWith(`apps${sep}game${sep}public${sep}scripts${sep}`)) return normalizedPath;
  return join('apps/game/src', normalizedPath);
}

function isHiddenPublicExplorerEntry(relativePath: string, entryName: string): boolean {
  return relativePath === 'apps/game/public' && entryName === 'scripts-compiled';
}

function isDynamicNodeSourcePath(path: string): boolean {
  return path.replaceAll('\\', '/').startsWith('apps/game/public/scripts/') && /\.node\.tsx?$/.test(path);
}

function isNodeSourceFile(path: string, content: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  if (!/\.(ts|tsx)$/.test(normalized) || normalized.endsWith('.d.ts')) return false;
  if (normalized.startsWith('apps/game/public/scripts/') && /\.node\.tsx?$/.test(normalized)) return true;
  if (/\/(nodes|Nodes)\//.test(normalized) && /Node\.tsx?$/.test(normalized)) return true;
  return /class\s+\w+Node\s+extends\s+\w*Node\b/.test(content) || /nodeTypeId\s*=/.test(content);
}

function fileExtension(fileName: string): string | undefined {
  const index = fileName.lastIndexOf('.');
  return index > 0 ? fileName.slice(index + 1).toLowerCase() : undefined;
}

function contentTypeForPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    case '.wav': return 'audio/wav';
    case '.mp3': return 'audio/mpeg';
    case '.ogg': return 'audio/ogg';
    case '.json': return 'application/json; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.txt': return 'text/plain; charset=utf-8';
    case '.woff2': return 'font/woff2';
    default: return 'application/octet-stream';
  }
}

function normalizeAssetPath(assetPath: string): string | undefined {
  const trimmed = assetPath.replace(/^\/+/, '').replaceAll('/', sep);
  if (trimmed.split(sep).includes('..')) return undefined;
  if (trimmed.startsWith(`apps${sep}game${sep}public${sep}assets${sep}`)) return trimmed;
  if (trimmed.startsWith(`public${sep}assets${sep}`)) return join('apps/game', trimmed);
  if (trimmed.startsWith(`assets${sep}`)) return join('apps/game/public', trimmed);
  return undefined;
}

function resolveSourceFile(nodePath: string[]): { filePath: string; nodePath: string[] } {
  const normalizedNodePath = stripRuntimeRootPath(nodePath);
  const first = normalizedNodePath[0];
  const prefabMap: Record<string, string> = {
    Player: 'apps/game/public/prefabs/player.prefab.json',
    Ship: 'apps/game/public/prefabs/ship.prefab.json',
    'UI.StatusHud': 'apps/game/public/prefabs/status-hud.prefab.json',
    'UI.BottomHud': 'apps/game/public/prefabs/bottom-hud.prefab.json',
  };
  if (prefabMap[first]) return { filePath: prefabMap[first], nodePath: normalizedNodePath };
  if (normalizedNodePath.includes('Player')) return { filePath: prefabMap.Player, nodePath: normalizedNodePath.slice(normalizedNodePath.indexOf('Player')) };
  if (normalizedNodePath.includes('Ship')) return { filePath: prefabMap.Ship, nodePath: normalizedNodePath.slice(normalizedNodePath.indexOf('Ship')) };
  if (normalizedNodePath.includes('UI.StatusHud')) return { filePath: prefabMap['UI.StatusHud'], nodePath: normalizedNodePath.slice(normalizedNodePath.indexOf('UI.StatusHud')) };
  if (normalizedNodePath.includes('UI.BottomHud')) return { filePath: prefabMap['UI.BottomHud'], nodePath: normalizedNodePath.slice(normalizedNodePath.indexOf('UI.BottomHud')) };
  const sceneMap: Record<string, string> = {
    Menu: 'apps/game/public/scenes/menu.scene.json',
    'Scene.Menu': 'apps/game/public/scenes/menu.scene.json',
    Loading: 'apps/game/public/scenes/loading.scene.json',
    'Scene.Loading': 'apps/game/public/scenes/loading.scene.json',
    Gameplay: 'apps/game/public/scenes/gameplay.scene.json',
    'Scene.Gameplay': 'apps/game/public/scenes/gameplay.scene.json',
    'UI.Gameplay': 'apps/game/public/scenes/gameplay.scene.json',
  };
  const filePath = sceneMap[first];
  if (!filePath) throw new EditorBackendError(`Unknown source root '${first}' for node path '${nodePath.join('/')}'`, 422);
  return { filePath, nodePath: normalizedNodePath };
}

function stripRuntimeRootPath(nodePath: string[]): string[] {
  const first = nodePath[0] ?? '';
  if (first === 'App-Root' || first === 'Play-Runtime-Root' || (first.startsWith('Editor-') && first.endsWith('-Root'))) return nodePath.slice(1);
  return nodePath;
}

interface SceneNodeLocation {
  node: SceneNodeJsonLike;
  parent?: SceneNodeJsonLike;
  index: number;
}

function findNodeByPath(root: SceneNodeJsonLike, nodePath: readonly string[]): SceneNodeJsonLike | undefined {
  return findNodeLocationByPath(root, nodePath)?.node;
}

function findNodeLocationByPath(root: SceneNodeJsonLike, nodePath: readonly string[]): SceneNodeLocation | undefined {
  if (root.name !== nodePath[0]) return undefined;
  if (nodePath.length === 1) return { node: root, index: -1 };
  let current: SceneNodeJsonLike = root;
  for (const part of nodePath.slice(1, -1)) {
    const child = current.children?.find((candidate) => candidate.name === part);
    if (!child) return undefined;
    current = child;
  }
  const leafName = nodePath.at(-1);
  const index = current.children?.findIndex((candidate) => candidate.name === leafName) ?? -1;
  const node = index >= 0 ? current.children?.[index] : undefined;
  return node ? { node, parent: current, index } : undefined;
}

function isDescendantNode(candidate: SceneNodeJsonLike, ancestor: SceneNodeJsonLike): boolean {
  return (ancestor.children ?? []).some((child) => child === candidate || isDescendantNode(candidate, child));
}

function resolveEditablePath(relativePath: string): { absolutePath: string; relativePath: string } {
  return resolveWorkspacePathInsideRoots(relativePath, editableFileRoots, 'editable path');
}

function resolveGitDiffPath(relativePath: string): { absolutePath: string; relativePath: string } {
  return resolveWorkspacePathInsideRoots(relativePath, gitEditorRoots, 'diff path');
}

function resolveWorkspacePathInsideRoots(relativePath: string, roots: string[], label: string): { absolutePath: string; relativePath: string } {
  if (!relativePath || isAbsolute(relativePath)) throw new EditorBackendError('path must be a relative repository path', 400);
  const normalized = relativePath.replaceAll('\\', sep).replaceAll('/', sep);
  if (normalized.split(sep).includes('..')) throw new EditorBackendError('path traversal is not allowed', 400);
  if (!roots.some((root) => normalized === root || normalized.startsWith(`${root}${sep}`))) {
    throw new EditorBackendError(`${label} must be inside one of: ${roots.join(', ')}`, 403);
  }
  const absolutePath = resolve(workspacePath, normalized);
  assertInsideRoot(absolutePath, workspacePath, label);
  return { absolutePath, relativePath: normalized.split(sep).join('/') };
}

function parseGitStatusLine(line: string): { status: string; path: string } {
  const status = line.slice(0, 2).trim() || 'M';
  const path = line.slice(2).trim().replace(/^.* -> /, '');
  return { status, path };
}

async function git(args: string[]): Promise<string> {
  if (args[0] === 'pushWithToken') return gitPushWithToken(args.slice(1));
  return gitOutside(['-C', workspacePath, ...args]);
}

async function gitOutside(args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync('git', args, { env: process.env, maxBuffer: 1024 * 1024 * 8 });
  if (stderr.trim()) console.warn('[git]', stderr.trim());
  return stdout;
}

async function gitPushWithToken(args: string[]): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new EditorBackendError('GITHUB_TOKEN is required for git push.', 500);
  const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
  return gitOutside(['-C', workspacePath, '-c', `http.https://github.com/.extraheader=${header}`, 'push', ...args]);
}

function assertAllowedRepoRoot(repoRoot: string): void {
  if (!allowedRepoRoots.some((root) => repoRoot === root || repoRoot.startsWith(`${root}${sep}`))) {
    throw new EditorBackendError('EDITOR_WORKSPACE is not allowlisted by EDITOR_ALLOWED_REPO_ROOTS.', 500);
  }
}

function assertInsideRoot(path: string, root: string, label: string): void {
  const pathRelativeToRoot = relative(root, path);
  if (pathRelativeToRoot.startsWith('..') || isAbsolute(pathRelativeToRoot)) throw new EditorBackendError(`${label} escapes configured root`, 400);
}

function parseAllowedRepoRoots(value: string | undefined, fallback: string): string[] {
  const roots = (value?.split(',') ?? [fallback]).map((entry) => entry.trim()).filter(Boolean).map((entry) => resolve(/* turbopackIgnore: true */ entry));
  return roots.length > 0 ? roots : [fallback];
}

function redactRepoUrl(url: string): string {
  return url.replace(/x-access-token:[^@]+@/, 'x-access-token:***@');
}
