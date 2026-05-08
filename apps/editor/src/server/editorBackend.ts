import 'server-only';

import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import type { DebugNodePatch, EditorChangeSet, EditorSetPropsChange } from '@gravity-dig/debug-protocol';

interface SaveRequest {
  message?: string;
  authorName?: string;
  authorEmail?: string;
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
].map((path) => path.replaceAll('/', sep));

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

export function appendChangesFromBody(sessionId: string, body: unknown): { accepted: EditorSetPropsChange[]; changeSet: EditorChangeSet } {
  const typed = body as Partial<EditorSetPropsChange> | { changes?: Partial<EditorSetPropsChange>[] } | undefined;
  const incoming = Array.isArray((typed as { changes?: unknown })?.changes) ? (typed as { changes: Partial<EditorSetPropsChange>[] }).changes : [typed as Partial<EditorSetPropsChange> | undefined];
  const accepted = incoming.map((change) => normalizeSetPropsChange(sessionId, change)).filter((change): change is EditorSetPropsChange => Boolean(change));
  if (accepted.length === 0) throw new EditorBackendError('No valid setProps changes. Required: kind=setProps, target.nodePath[], props{}.', 400);
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
  const changeSet = readChangeSet(sessionId);
  const uploads = assetUploads.get(sessionId) ?? [];
  if (changeSet.changes.length === 0 && uploads.length === 0) return { sessionId, saved: false, message: 'No pending changes.' };
  return withWorkspaceLock(async () => {
    await ensureWorkspaceUnlocked();
    await syncWorkspaceToOriginUnlocked();
    for (const change of changeSet.changes) await applyChangeToWorkspace(change);
    for (const upload of uploads) await applyAssetUploadToWorkspace(upload);
    await git(['diff', '--check']);
    const status = (await git(['status', '--short'])).trim();
    if (!status) return { sessionId, saved: false, message: 'Changes already match git working tree.' };
    await git(['config', 'user.name', request.authorName ?? defaultAuthorName]);
    await git(['config', 'user.email', request.authorEmail ?? defaultAuthorEmail]);
    await git(['add', 'apps/game/public']);
    const totalChanges = changeSet.changes.length + uploads.length;
    await git(['commit', '-m', request.message?.trim() || `editor: save ${totalChanges} pending change${totalChanges === 1 ? '' : 's'}`]);
    const commit = (await git(['rev-parse', '--short', 'HEAD'])).trim();
    await pushWithRebase();
    return { sessionId, saved: true, commit, files: status.split('\n') };
  });
}

export async function gitStatus() {
  return withWorkspaceLock(async () => {
    await ensureWorkspaceUnlocked();
    await git(['fetch', 'origin', gitBranch]);
    const divergence = await branchDivergence();
    return {
      ok: true,
      branch: gitBranch,
      head: (await git(['rev-parse', '--short', 'HEAD'])).trim(),
      originHead: (await git(['rev-parse', '--short', `origin/${gitBranch}`])).trim(),
      status: (await git(['status', '--short'])).trim().split('\n').filter(Boolean),
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

export async function listNodeFiles(): Promise<{ root: PublicFileEntry }> {
  const rootPath = await ensureNodeRoot();
  const root = await readNodeDirectory(rootPath, 'apps/game/src');
  return { root: { ...root, name: 'Nodes', path: 'apps/game/src' } };
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
  return { ok: true, path: safePath.relativePath };
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

function normalizeSetPropsChange(sessionId: string, change: Partial<EditorSetPropsChange> | undefined): EditorSetPropsChange | undefined {
  if (!change || change.kind !== 'setProps' || !Array.isArray(change.target?.nodePath) || typeof change.props !== 'object' || change.props === null) return undefined;
  const nodePath = change.target.nodePath.map((part) => String(part).trim()).filter(Boolean);
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

function appendChanges(sessionId: string, changes: EditorSetPropsChange[]): EditorChangeSet {
  const current = readChangeSet(sessionId);
  const byProp = new Map<string, EditorSetPropsChange>();

  for (const change of current.changes) {
    const prop = singlePropName(change);
    if (prop) byProp.set(changeKey(change.target.nodePath, prop, singleFieldName(change)), change);
  }

  for (const incoming of changes.flatMap(splitChangeByProp)) {
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

  const next: EditorChangeSet = { ...current, sessionId, changes: [...byProp.values()], updatedAt: Date.now() };
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
  await rm(workspacePath, { recursive: true, force: true });
  await mkdir(dirname(workspacePath), { recursive: true });
  await gitOutside(['clone', '--branch', gitBranch, gitRepoUrl, workspacePath]);
}

async function syncWorkspaceToOriginUnlocked(): Promise<void> {
  await git(['fetch', 'origin', gitBranch]);
  await git(['checkout', gitBranch]);
  await git(['reset', '--hard', `origin/${gitBranch}`]);
}

async function ensurePublicRoot(): Promise<string> {
  return ensureWorkspaceSubtree('apps/game/public', 'Public root');
}

async function ensureNodeRoot(): Promise<string> {
  return ensureWorkspaceSubtree('apps/game/src', 'Node source root');
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
  const rootPath = await ensureNodeRoot();
  const normalizedPath = relativePath.replace(/^\/+/, '').replaceAll('/', sep);
  if (!normalizedPath || normalizedPath.split(sep).includes('..')) throw new EditorBackendError('Invalid node file path.', 400);
  const fullRelativePath = normalizedPath.startsWith(`apps${sep}game${sep}src${sep}`) ? normalizedPath : join('apps/game/src', normalizedPath);
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

async function applyChangeToWorkspace(change: EditorSetPropsChange): Promise<void> {
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

async function applyAssetUploadToWorkspace(upload: StagedAssetUpload): Promise<void> {
  const target = resolveEditablePath(upload.assetPath);
  await mkdir(dirname(target.absolutePath), { recursive: true });
  await writeFile(target.absolutePath, await readFile(upload.uploadPath));
}

async function readPublicDirectory(absolutePath: string, relativePath: string): Promise<PublicFileEntry> {
  assertInsideRoot(absolutePath, workspacePath, 'publicPath');
  const entries = await readdir(absolutePath, { withFileTypes: true });
  const children = await Promise.all(entries
    .filter((entry) => !entry.name.startsWith('.'))
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

  return { name: relativePath === 'apps/game/src' ? 'Nodes' : relativePath.split('/').at(-1) ?? relativePath, path: relativePath, kind: 'directory', children };
}

function isNodeSourceFile(path: string, content: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  if (!/\.(ts|tsx)$/.test(normalized) || normalized.endsWith('.d.ts')) return false;
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
  const first = nodePath[0];
  const prefabMap: Record<string, string> = {
    Player: 'apps/game/public/prefabs/player.prefab.json',
    Ship: 'apps/game/public/prefabs/ship.prefab.json',
    'UI.StatusHud': 'apps/game/public/prefabs/status-hud.prefab.json',
    'UI.BottomHud': 'apps/game/public/prefabs/bottom-hud.prefab.json',
  };
  if (prefabMap[first]) return { filePath: prefabMap[first], nodePath };
  if (nodePath.includes('Player')) return { filePath: prefabMap.Player, nodePath: nodePath.slice(nodePath.indexOf('Player')) };
  if (nodePath.includes('Ship')) return { filePath: prefabMap.Ship, nodePath: nodePath.slice(nodePath.indexOf('Ship')) };
  if (nodePath.includes('UI.StatusHud')) return { filePath: prefabMap['UI.StatusHud'], nodePath: nodePath.slice(nodePath.indexOf('UI.StatusHud')) };
  if (nodePath.includes('UI.BottomHud')) return { filePath: prefabMap['UI.BottomHud'], nodePath: nodePath.slice(nodePath.indexOf('UI.BottomHud')) };
  const sceneMap: Record<string, string> = {
    Menu: 'apps/game/public/scenes/menu.scene.json',
    Loading: 'apps/game/public/scenes/loading.scene.json',
    Gameplay: 'apps/game/public/scenes/gameplay.scene.json',
    'UI.Gameplay': 'apps/game/public/scenes/gameplay-ui.scene.json',
  };
  const filePath = sceneMap[first];
  if (!filePath) throw new EditorBackendError(`Unknown source root '${first}' for node path '${nodePath.join('/')}'`, 422);
  return { filePath, nodePath };
}

function findNodeByPath(root: SceneNodeJsonLike, nodePath: readonly string[]): SceneNodeJsonLike | undefined {
  if (root.name !== nodePath[0]) return undefined;
  let current: SceneNodeJsonLike = root;
  for (const part of nodePath.slice(1)) {
    const child = current.children?.find((candidate) => candidate.name === part);
    if (!child) return undefined;
    current = child;
  }
  return current;
}

function resolveEditablePath(relativePath: string): { absolutePath: string; relativePath: string } {
  if (!relativePath || isAbsolute(relativePath)) throw new EditorBackendError('path must be a relative repository path', 400);
  const normalized = relativePath.replaceAll('\\', sep).replaceAll('/', sep);
  if (normalized.split(sep).includes('..')) throw new EditorBackendError('path traversal is not allowed', 400);
  if (!editableFileRoots.some((root) => normalized === root || normalized.startsWith(`${root}${sep}`))) {
    throw new EditorBackendError(`path must be inside one of: ${editableFileRoots.join(', ')}`, 403);
  }
  const absolutePath = resolve(workspacePath, normalized);
  assertInsideRoot(absolutePath, workspacePath, 'path');
  return { absolutePath, relativePath: normalized.split(sep).join('/') };
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
