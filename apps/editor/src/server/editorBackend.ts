import 'server-only';

import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { constants as fsConstants, existsSync } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import type { DebugNodeMovePlacement, DebugNodePatch, EditorAddNodeChange, EditorChange, EditorChangeSet, EditorDeleteNodeChange, EditorMoveNodeChange, EditorSetPropsChange } from '@gravity-dig/debug-protocol';
import {
  addAtlasProjectFrame as addAtlasProjectFrameInWorkspace,
  createAtlasProject as createAtlasProjectInWorkspace,
  mutateAtlasProject as mutateAtlasProjectInWorkspace,
  readAtlasProjectDocument,
  rebuildAtlasProjectsForPaths,
  saveAtlasProjectMetadata,
  type AtlasCreateOptions,
  type AtlasFrameUpload,
  type AtlasMutation,
} from '../atlas-project/server';
import { isEditorSourcePath, normalizeEditorSourcePath } from './editorSourcePath';

interface SaveRequest {
  message?: string;
  authorName?: string;
  authorEmail?: string;
}

export interface EditorGitDiffFile {
  path: string;
  status: string;
  kind: 'text' | 'image';
  contentType?: string;
  original: string;
  modified: string;
  originalBase64?: string;
  modifiedBase64?: string;
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
  instanceId?: string;
  nodeId?: string;
  id?: string;
  prefab?: string;
  prefabId?: string;
  props?: Record<string, unknown>;
  overrides?: Record<string, Record<string, unknown>>;
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
  'apps/game/public/schemas',
  'apps/game/public/game.settings.json',
  'apps/game/public/assets',
  'apps/game/public/scripts',
].map((path) => path.replaceAll('/', sep));
const gitEditorRoots = [`apps${sep}game${sep}public`, `apps${sep}game${sep}src`];
const gitEditorRootArgs = gitEditorRoots.map((path) => path.split(sep).join('/'));

type WorkspaceActivityPhase = 'ready' | 'cloning' | 'fetching' | 'syncing' | 'building-dynamic-nodes';

const workspaceActivity: { phase: WorkspaceActivityPhase; message: string; busy: boolean; startedAt?: number; updatedAt: number } = {
  phase: 'ready',
  message: 'Git-Workspace noch nicht initialisiert.',
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

function currentWorkspaceStatus() {
  const exists = existsSync(join(workspacePath, '.git'));
  return {
    path: workspacePath,
    exists,
    ...workspaceActivity,
    message: exists || workspaceActivity.busy ? workspaceActivity.message : 'Git-Workspace noch nicht initialisiert.',
  };
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
    workspace: currentWorkspaceStatus(),
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
  if (accepted.length === 0) throw new EditorBackendError('No valid editor changes. Required: kind=setProps, kind=moveNode, kind=addNode or kind=deleteNode.', 400);
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

export async function removePendingAddNode(sessionId: string, body: unknown): Promise<EditorChangeSet> {
  const typed = body as { parentPath?: unknown; node?: Partial<EditorAddNodeChange['node']> } | undefined;
  const parentPath = Array.isArray(typed?.parentPath) ? normalizeNodePathInput(typed.parentPath) : [];
  const node = typed?.node;
  if (parentPath.length === 0 || !node || typeof node.nodeTypeId !== 'string') throw new EditorBackendError('Required: parentPath and node.nodeTypeId.', 400);

  await withWorkspaceLock(async () => {
    await ensureWorkspaceUnlocked();
    await removeAddedNodeFromWorkspace(parentPath, node);
  });

  const current = readChangeSet(sessionId);
  const changes = current.changes.filter((change) => change.kind !== 'addNode' || !pendingAddMatches(change, parentPath, node));
  const next: EditorChangeSet = { ...current, changes, updatedAt: Date.now() };
  if (changes.length === 0) changeSets.delete(sessionId);
  else changeSets.set(sessionId, next);
  return readChangeSet(sessionId);
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
    const contentType = contentTypeForPath(path);
    if (contentType.startsWith('image/')) {
      const maxImageDiffBytes = 64 * 1024 * 1024;
      let original: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      if (!/[A?]/.test(status)) {
        const originalSize = Number((await git(['cat-file', '-s', `HEAD:${path}`])).trim());
        if (originalSize > maxImageDiffBytes) throw new EditorBackendError('HEAD image exceeds the 64 MB diff limit.', 413);
        original = await gitBuffer(['show', `HEAD:${path}`]);
      }
      const modifiedStat = await stat(safePath.absolutePath).catch(() => undefined);
      if ((modifiedStat?.size ?? 0) > maxImageDiffBytes) throw new EditorBackendError('Workspace image exceeds the 64 MB diff limit.', 413);
      const modified = modifiedStat?.isFile() ? await readFile(safePath.absolutePath) : Buffer.alloc(0);
      return {
        path,
        status,
        kind: 'image',
        contentType,
        original: '',
        modified: '',
        originalBase64: original.length > 0 ? original.toString('base64') : undefined,
        modifiedBase64: modified.length > 0 ? modified.toString('base64') : undefined,
      };
    }
    const original = await git(['show', `HEAD:${path}`]).catch(() => '');
    const modified = await readFile(safePath.absolutePath, 'utf8').catch(() => '');
    return { path, status, kind: 'text', original, modified };
  });
}

export async function gitStatus(options: { refreshRemote?: boolean } = {}) {
  return withWorkspaceLock(async () => {
    await ensureWorkspaceUnlocked();
    if (options.refreshRemote) await git(['fetch', 'origin', gitBranch]);
    const divergence = await branchDivergence();
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
  return { root: { ...sourceRoot, name: 'Source', path: 'apps/game/src' } };
}

export async function listNodeDirectories(): Promise<{ root: PublicFileEntry }> {
  const sourceRootPath = await ensureNodeRoot();
  const sourceRoot = await readDirectoryStructure(sourceRootPath, 'apps/game/src');
  return { root: { ...sourceRoot, name: 'Source', path: 'apps/game/src' } };
}

export async function listNodeDirectoryFiles(relativePath: string): Promise<{ path: string; files: PublicFileEntry[] }> {
  const directory = await resolveNodeDirectoryPath(relativePath);
  return { path: directory.relativePath, files: await readDirectPublicFiles(directory.absolutePath, directory.relativePath) };
}

export async function readNodeFile(relativePath: string): Promise<{ path: string; content: string; modifiedAt: number; size: number }> {
  const filePath = await resolveNodeFilePath(relativePath);
  const fileStat = await stat(filePath.absolutePath);
  return { path: filePath.relativePath, content: await readFile(filePath.absolutePath, 'utf8'), modifiedAt: fileStat.mtimeMs, size: fileStat.size };
}

export async function readPublicFile(relativePath: string): Promise<{ content: Buffer; contentType: string; path: string; size: number; modifiedAt: number }> {
  const filePath = await resolvePublicFilePath(relativePath);
  const [content, fileStat] = await Promise.all([readFile(filePath.absolutePath), stat(filePath.absolutePath)]);
  return { content, contentType: contentTypeForPath(filePath.relativePath), path: filePath.relativePath, size: content.length, modifiedAt: fileStat.mtimeMs };
}

export async function deleteExplorerFiles(body: unknown) {
  const typed = body as { paths?: unknown } | undefined;
  const paths = Array.isArray(typed?.paths) ? [...new Set(typed.paths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0))] : [];
  if (paths.length === 0 || paths.length > 100) throw new EditorBackendError('Required: 1 to 100 file paths.', 400);
  const deleted = await withWorkspaceLock(async () => {
    await ensureWorkspaceUnlocked();
    const resolved = await Promise.all(paths.map((path) => resolveExplorerMutationFilePath(path)));
    const backupRoot = resolve(workspacePath, `.editor-delete-${randomUUID()}`);
    await mkdir(backupRoot);
    const moved: { sourcePath: string; backupPath: string }[] = [];
    try {
      for (const [index, file] of resolved.entries()) {
        const backupPath = resolve(backupRoot, String(index));
        await rename(file.absolutePath, backupPath);
        moved.push({ sourcePath: file.absolutePath, backupPath });
      }
    } catch (error) {
      for (const file of moved.reverse()) await rename(file.backupPath, file.sourcePath).catch(() => undefined);
      await rm(backupRoot, { recursive: true, force: true });
      throw error;
    }
    await rm(backupRoot, { recursive: true, force: true });
    return resolved.map((file) => file.relativePath);
  });
  const [buildResult, atlasResult] = await Promise.all([
    buildDynamicNodesAfterExplorerMutation(deleted),
    buildAtlasesAfterExplorerMutation(deleted),
  ]);
  return { ok: true, deleted, ...buildResult, ...atlasResult };
}

export async function uploadExplorerFiles(directoryPath: string, files: { name: string; content: Buffer }[]) {
  if (files.length === 0 || files.length > 100) throw new EditorBackendError('Required: 1 to 100 files.', 400);
  const totalBytes = files.reduce((total, file) => total + file.content.length, 0);
  if (totalBytes > 200 * 1024 * 1024) throw new EditorBackendError('Upload exceeds the 200 MB limit.', 413);
  const written = await withWorkspaceLock(async () => {
    await ensureWorkspaceUnlocked();
    const directory = await resolveExplorerMutationDirectoryPath(directoryPath);
    const names = new Set<string>();
    const targets = await Promise.all(files.map(async (file) => {
      const name = file.name.trim();
      if (!name || name === '.' || name === '..' || basename(name) !== name || name.includes('/') || name.includes('\\')) {
        throw new EditorBackendError(`Invalid upload filename: ${file.name}`, 400);
      }
      if (names.has(name)) throw new EditorBackendError(`Duplicate upload filename: ${name}`, 400);
      names.add(name);
      const absolutePath = resolve(directory.absolutePath, name);
      assertInsideRoot(absolutePath, directory.absolutePath, 'uploadFile');
      const existing = await lstat(absolutePath).catch(() => undefined);
      if (existing?.isSymbolicLink() || (existing && !existing.isFile())) throw new EditorBackendError(`Upload target is not a regular file: ${name}`, 400);
      return { absolutePath, relativePath: `${directory.relativePath}/${name}`, content: file.content, existed: Boolean(existing), tempPath: `${absolutePath}.upload-${randomUUID()}` };
    }));
    const backupRoot = resolve(workspacePath, `.editor-upload-${randomUUID()}`);
    await mkdir(backupRoot);
    const committed: { target: (typeof targets)[number]; backupPath?: string }[] = [];
    try {
      for (const target of targets) await writeNewFileNoFollow(target.tempPath, target.content);
      for (const [index, target] of targets.entries()) {
        const backupPath = target.existed ? resolve(backupRoot, String(index)) : undefined;
        if (backupPath) await rename(target.absolutePath, backupPath);
        try {
          await rename(target.tempPath, target.absolutePath);
        } catch (error) {
          if (backupPath) await rename(backupPath, target.absolutePath).catch(() => undefined);
          throw error;
        }
        committed.push({ target, backupPath });
      }
    } catch (error) {
      for (const entry of committed.reverse()) {
        await rm(entry.target.absolutePath, { force: true });
        if (entry.backupPath) await rename(entry.backupPath, entry.target.absolutePath).catch(() => undefined);
      }
      for (const target of targets) await rm(target.tempPath, { force: true });
      await rm(backupRoot, { recursive: true, force: true });
      throw error;
    }
    await rm(backupRoot, { recursive: true, force: true });
    return targets.map(({ relativePath, content }) => ({ path: relativePath, size: content.length }));
  });
  const changedPaths = written.map((file) => file.path);
  const [buildResult, atlasResult] = await Promise.all([
    buildDynamicNodesAfterExplorerMutation(changedPaths),
    buildAtlasesAfterExplorerMutation(changedPaths),
  ]);
  return { ok: true, written, overwritten: true, ...buildResult, ...atlasResult };
}

async function writeNewFileNoFollow(path: string, content: Buffer): Promise<void> {
  const handle = await open(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(content);
  } finally {
    await handle.close();
  }
}

async function buildDynamicNodesAfterExplorerMutation(paths: string[]): Promise<{ dynamicNodeBuild?: Awaited<ReturnType<typeof buildDynamicNodeModules>>; dynamicNodeBuildError?: string }> {
  if (!paths.some(isDynamicNodeSourcePath)) return {};
  try {
    return { dynamicNodeBuild: await buildDynamicNodeModules() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lines = message.split('\n').map((line) => line.trim()).filter(Boolean);
    const detail = lines.find((line) => line.includes('ERROR:') || /^Error(?:\s|\[)/.test(line));
    return { dynamicNodeBuildError: detail ? `${lines[0]} ${detail}` : lines[0] ?? 'Dynamic Node Build fehlgeschlagen.' };
  }
}

async function buildAtlasesAfterExplorerMutation(paths: string[]): Promise<{ atlasBuilds?: Awaited<ReturnType<typeof rebuildAtlasProjectsForPaths>>['builds']; atlasBuildErrors?: string[] }> {
  const result = await rebuildAtlasProjectsForPaths(workspacePath, paths);
  return {
    ...(result.builds.length > 0 ? { atlasBuilds: result.builds } : {}),
    ...(result.errors.length > 0 ? { atlasBuildErrors: result.errors } : {}),
  };
}

export async function createAtlasProject(options: AtlasCreateOptions) {
  try {
    const build = await withWorkspaceLock(async () => {
      await ensureWorkspaceUnlocked();
      return createAtlasProjectInWorkspace(workspacePath, options);
    });
    return { ok: true, build };
  } catch (error) {
    throw new EditorBackendError(error instanceof Error ? error.message : String(error), 422);
  }
}

export async function readAtlasProject(imagePath: string) {
  await ensureWorkspace();
  try {
    return { ok: true, document: await readAtlasProjectDocument(workspacePath, imagePath) };
  } catch (error) {
    throw new EditorBackendError(error instanceof Error ? error.message : String(error), 422);
  }
}

export async function updateAtlasProject(imagePath: string, mutation: AtlasMutation) {
  try {
    const build = await withWorkspaceLock(async () => {
      await ensureWorkspaceUnlocked();
      return mutateAtlasProjectInWorkspace(workspacePath, imagePath, mutation);
    });
    return { ok: true, build };
  } catch (error) {
    throw new EditorBackendError(error instanceof Error ? error.message : String(error), 422);
  }
}

export async function uploadAtlasProjectFrame(imagePath: string, upload: AtlasFrameUpload) {
  try {
    const build = await withWorkspaceLock(async () => {
      await ensureWorkspaceUnlocked();
      return addAtlasProjectFrameInWorkspace(workspacePath, imagePath, upload);
    });
    return { ok: true, build };
  } catch (error) {
    throw new EditorBackendError(error instanceof Error ? error.message : String(error), 422);
  }
}

export async function writeEditorFile(relativePath: string, content: string) {
  await ensureWorkspace();
  const safePath = resolveEditablePath(relativePath);
  if (/\.atlas\.json$/i.test(safePath.relativePath)) {
    try {
      const build = await withWorkspaceLock(() => saveAtlasProjectMetadata(workspacePath, safePath.relativePath, content));
      return { ok: true, path: safePath.relativePath, dynamicNodeBuild: undefined, atlasBuilds: [build] };
    } catch (error) {
      throw new EditorBackendError(error instanceof Error ? error.message : String(error), 422);
    }
  }
  await mkdir(dirname(safePath.absolutePath), { recursive: true });
  await writeFile(safePath.absolutePath, content);
  const dynamicNodeBuild = isDynamicNodeSourcePath(safePath.relativePath) ? await buildDynamicNodeModules() : undefined;
  const atlasResult = await buildAtlasesAfterExplorerMutation([safePath.relativePath]);
  return { ok: true, path: safePath.relativePath, dynamicNodeBuild, ...atlasResult };
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
  if (change.kind === 'deleteNode') return normalizeDeleteNodeChange(sessionId, change as Partial<EditorDeleteNodeChange>);
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
    target: {
      nodePath,
      managerPath: typeof change.target.managerPath === 'string' ? change.target.managerPath : undefined,
      prefabPath: typeof change.target.prefabPath === 'string' ? change.target.prefabPath : undefined,
      prefabId: typeof change.target.prefabId === 'string' ? change.target.prefabId : undefined,
      prefabNodePath: Array.isArray(change.target.prefabNodePath) ? normalizeNodePathInput(change.target.prefabNodePath) : undefined,
      prefabNodeId: typeof change.target.prefabNodeId === 'string' ? change.target.prefabNodeId : undefined,
      prefabInstancePath: Array.isArray(change.target.prefabInstancePath) ? normalizeNodePathInput(change.target.prefabInstancePath) : undefined,
    },
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
      instanceId: typeof change.node.instanceId === 'string' ? change.node.instanceId : undefined,
      name: typeof change.node.name === 'string' ? change.node.name : undefined,
      props: typeof change.node.props === 'object' && change.node.props !== null ? change.node.props : undefined,
      children: Array.isArray(change.node.children) ? change.node.children : undefined,
    },
    createdAt: change.createdAt ?? Date.now(),
  };
}

function normalizeDeleteNodeChange(sessionId: string, change: Partial<EditorDeleteNodeChange> | undefined): EditorDeleteNodeChange | undefined {
  if (!change || change.kind !== 'deleteNode' || !Array.isArray(change.target?.nodePath)) return undefined;
  const nodePath = normalizeNodePathInput(change.target.nodePath);
  if (nodePath.length === 0) return undefined;
  return {
    id: change.id ?? randomUUID(),
    kind: 'deleteNode',
    sessionId,
    target: { nodePath },
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

  let moveChanges = current.changes.filter((change): change is EditorMoveNodeChange => change.kind === 'moveNode');
  let addChanges = current.changes.filter((change): change is EditorAddNodeChange => change.kind === 'addNode');
  let deleteChanges = current.changes.filter((change): change is EditorDeleteNodeChange => change.kind === 'deleteNode');

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

  const incomingDeletes = changes.filter((change): change is EditorDeleteNodeChange => change.kind === 'deleteNode');
  for (const incomingDelete of incomingDeletes) {
    const deletePath = incomingDelete.target.nodePath;
    const matchingAdd = addChanges.find((add) => scenePropValuesEqual(addNodePath(add), deletePath));
    if (matchingAdd) {
      addChanges = addChanges.filter((add) => add !== matchingAdd);
      deleteChanges = deleteChanges.filter((change) => !isSameOrDescendantPath(change.target.nodePath, deletePath));
      moveChanges = moveChanges.filter((change) => !isSameOrDescendantPath(change.target.nodePath, deletePath));
      for (const [key, change] of byProp) if (isSameOrDescendantPath(change.target.nodePath, deletePath)) byProp.delete(key);
    } else {
      deleteChanges = [...deleteChanges.filter((change) => !isSameOrDescendantPath(change.target.nodePath, deletePath)), incomingDelete];
      moveChanges = moveChanges.filter((change) => !isSameOrDescendantPath(change.target.nodePath, deletePath));
      for (const [key, change] of byProp) if (isSameOrDescendantPath(change.target.nodePath, deletePath)) byProp.delete(key);
    }
  }

  const incomingMoves = changes.filter((change): change is EditorMoveNodeChange => change.kind === 'moveNode');
  const incomingAdds = changes.filter((change): change is EditorAddNodeChange => change.kind === 'addNode');
  const nextMoves = [...moveChanges, ...incomingMoves];
  const nextAdds = [...addChanges, ...incomingAdds];
  const next: EditorChangeSet = { ...current, sessionId, changes: [...byProp.values(), ...nextMoves, ...nextAdds, ...deleteChanges], updatedAt: Date.now() };
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

function addNodePath(change: EditorAddNodeChange): string[] {
  return [...change.target.nodePath, change.node.name ?? change.node.nodeTypeId];
}

function isSameOrDescendantPath(candidate: readonly string[], path: readonly string[]): boolean {
  return candidate.length >= path.length && path.every((part, index) => candidate[index] === part);
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

async function resolveExplorerMutationFilePath(relativePath: string): Promise<{ absolutePath: string; relativePath: string }> {
  const resolved = resolveExplorerMutationPath(relativePath);
  const fileStat = await lstat(resolved.absolutePath).catch(() => undefined);
  if (!fileStat?.isFile() || fileStat.isSymbolicLink()) throw new EditorBackendError(`Explorer path is not a regular file: ${resolved.relativePath}`, 400);
  const [realFilePath, realRootPath] = await Promise.all([realpath(resolved.absolutePath), realpath(resolved.absoluteRoot)]);
  assertInsideRoot(realFilePath, realRootPath, 'explorerRealFile');
  return { absolutePath: realFilePath, relativePath: resolved.relativePath };
}

async function resolveExplorerMutationDirectoryPath(relativePath: string): Promise<{ absolutePath: string; relativePath: string }> {
  const resolved = resolveExplorerMutationPath(relativePath);
  const fileStat = await lstat(resolved.absolutePath).catch(() => undefined);
  if (!fileStat?.isDirectory() || fileStat.isSymbolicLink()) throw new EditorBackendError(`Explorer path is not a regular directory: ${resolved.relativePath}`, 400);
  const [realDirectoryPath, realRootPath] = await Promise.all([realpath(resolved.absolutePath), realpath(resolved.absoluteRoot)]);
  assertInsideRoot(realDirectoryPath, realRootPath, 'explorerRealDirectory');
  return { absolutePath: realDirectoryPath, relativePath: resolved.relativePath };
}

function resolveExplorerMutationPath(relativePath: string): { absolutePath: string; absoluteRoot: string; relativePath: string } {
  const normalized = relativePath.replace(/^\/+/, '').replaceAll('\\', '/');
  if (!normalized || normalized.split('/').includes('..')) throw new EditorBackendError('Invalid explorer path.', 400);
  const allowedRoot = normalized === 'apps/game/public' || normalized.startsWith('apps/game/public/')
    ? 'apps/game/public'
    : normalized === 'apps/game/src' || normalized.startsWith('apps/game/src/')
      ? 'apps/game/src'
      : undefined;
  if (!allowedRoot) throw new EditorBackendError('Explorer mutations are limited to apps/game/public and apps/game/src.', 403);
  const absoluteRoot = resolve(workspacePath, allowedRoot);
  const absolutePath = resolve(workspacePath, normalized);
  assertInsideRoot(absolutePath, absoluteRoot, 'explorerPath');
  return { absolutePath, absoluteRoot, relativePath: normalized };
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
  const fullRelativePath = normalizeEditorSourcePath(normalizedPath.split(sep).join('/')).replaceAll('/', sep);
  const rootPath = fullRelativePath.startsWith(`apps${sep}game${sep}public${sep}`) ? await ensurePublicRoot() : await ensureNodeRoot();
  const absolutePath = resolve(workspacePath, fullRelativePath);
  assertInsideRoot(absolutePath, rootPath, 'nodeFile');
  const fileStat = await stat(absolutePath);
  if (!fileStat.isFile()) throw new EditorBackendError('Node path is not a file.', 400);
  if (!isEditorSourcePath(fullRelativePath)) throw new EditorBackendError('Path is not an editor source file.', 403);
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
  if (change.kind === 'deleteNode') {
    await applyDeleteNodeToWorkspace(change);
    return;
  }
  if (change.target.prefabPath && change.target.prefabNodeId && change.target.prefabInstancePath) {
    await applyPrefabOverrideToWorkspace(change);
    return;
  }
  const source = change.target.managerPath
    ? { filePath: `apps/game/public/${change.target.managerPath}`, nodePath: change.target.nodePath }
    : resolveSourceFile(change.target.nodePath);
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


async function applyPrefabOverrideToWorkspace(change: EditorSetPropsChange): Promise<void> {
  const prefabPath = change.target.prefabPath;
  const prefabNodeId = change.target.prefabNodeId;
  const instancePath = change.target.prefabInstancePath;
  if (!prefabPath || !prefabNodeId || !instancePath) return;

  const sceneSource = resolveSceneSourceFile(instancePath);
  const sceneFilePath = resolveEditablePath(sceneSource.filePath);
  const sceneFile = JSON.parse(await readFile(sceneFilePath.absolutePath, 'utf8')) as { root: SceneNodeJsonLike };
  const declaration = findPrefabDeclaration(sceneFile.root, sceneSource.nodePath, prefabPath);
  if (!declaration) throw new EditorBackendError(`Prefab instance '${prefabPath}' is runtime-only and cannot persist authoring overrides`, 422);

  const prefabFilePath = resolveEditablePath(`apps/game/public/${prefabPath.replace(/^\/+/, '')}`);
  const prefabFile = JSON.parse(await readFile(prefabFilePath.absolutePath, 'utf8')) as { root: SceneNodeJsonLike };
  const prefabNode = findNodeByInstanceId(prefabFile.root, prefabNodeId);
  if (!prefabNode) throw new EditorBackendError(`Could not locate prefab node '${prefabNodeId}'`, 422);

  const overrideKey = prefabFile.root.nodeId === prefabNodeId ? '$' : prefabNodeId;
  const current = overrideKey === '$' ? { ...(declaration.props ?? {}) } : { ...(declaration.overrides?.[overrideKey] ?? {}) };
  for (const [key, value] of Object.entries(change.props)) {
    const field = singleFieldName(change);
    if (value === null) delete current[key];
    else if (field && isObjectPropValue(value)) {
      const existing = isObjectPropValue(current[key]) ? current[key] : {};
      current[key] = { ...existing, [field]: (value as unknown as Record<string, unknown>)[field] };
    } else current[key] = value;
  }
  const sparse = sparseObjectDifference(prefabNode.props ?? {}, current);
  if (overrideKey === '$') {
    if (Object.keys(sparse).length > 0) declaration.props = sparse;
    else delete declaration.props;
  } else {
    declaration.overrides = { ...(declaration.overrides ?? {}) };
    if (Object.keys(sparse).length > 0) declaration.overrides[overrideKey] = sparse;
    else delete declaration.overrides[overrideKey];
    if (Object.keys(declaration.overrides).length === 0) delete declaration.overrides;
  }
  await writeFile(sceneFilePath.absolutePath, `${JSON.stringify(sceneFile, null, 2)}\n`);
}

function sparseObjectDifference(base: Record<string, unknown>, values: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const baseValue = base[key];
    if (isObjectPropValue(baseValue) && isObjectPropValue(value)) {
      const nested = sparseObjectDifference(baseValue, value);
      if (Object.keys(nested).length > 0) result[key] = nested;
    } else if (JSON.stringify(baseValue) !== JSON.stringify(value)) result[key] = value;
  }
  return result;
}

function pendingAddMatches(change: EditorAddNodeChange, parentPath: string[], node: Partial<EditorAddNodeChange['node']>): boolean {
  return change.target.nodePath.join('\u0000') === parentPath.join('\u0000')
    && change.node.nodeTypeId === node.nodeTypeId
    && (node.name === undefined || change.node.name === node.name)
    && (node.props === undefined || scenePropValuesEqual(change.node.props ?? {}, node.props ?? {}));
}

async function removeAddedNodeFromWorkspace(parentPath: string[], node: Partial<EditorAddNodeChange['node']>): Promise<void> {
  const source = resolveSourceFile(parentPath);
  const filePath = resolveEditablePath(source.filePath);
  const file = JSON.parse(await readFile(filePath.absolutePath, 'utf8')) as { root: SceneNodeJsonLike };
  const parent = findNodeByPath(file.root, source.nodePath);
  if (!parent?.children) return;
  const index = parent.children.findIndex((candidate) => sceneNodeMatchesPendingAdd(candidate, node));
  if (index < 0) return;
  parent.children = parent.children.filter((_, childIndex) => childIndex !== index);
  await writeFile(filePath.absolutePath, `${JSON.stringify(file, null, 2)}\n`);
}

function sceneNodeMatchesPendingAdd(candidate: SceneNodeJsonLike, node: Partial<EditorAddNodeChange['node']>): boolean {
  return candidate.nodeTypeId === node.nodeTypeId
    && (node.name === undefined || candidate.name === node.name)
    && (node.props === undefined || scenePropValuesEqual(candidate.props ?? {}, node.props ?? {}));
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
    instanceId: node.instanceId,
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

async function applyDeleteNodeToWorkspace(change: EditorDeleteNodeChange): Promise<void> {
  const source = resolveSourceFile(change.target.nodePath);
  const filePath = resolveEditablePath(source.filePath);
  const file = JSON.parse(await readFile(filePath.absolutePath, 'utf8')) as { root: SceneNodeJsonLike };
  const location = findNodeLocationByPath(file.root, source.nodePath);
  if (!location?.parent) throw new EditorBackendError(`Could not locate deletable node path '${change.target.nodePath.join('/')}' in ${source.filePath}`, 422);
  const children = [...(location.parent.children ?? [])];
  children.splice(location.index, 1);
  location.parent.children = children;
  await writeFile(filePath.absolutePath, `${JSON.stringify(file, null, 2)}\n`);
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
  const fullRelativePath = normalizedPath === `apps${sep}game` ? normalizedPath : normalizeEditorSourcePath(normalizedPath.split(sep).join('/')).replaceAll('/', sep);
  if (fullRelativePath === `apps${sep}game`) return { absolutePath: await ensureNodeRoot(), relativePath: 'apps/game' };
  const rootPath = fullRelativePath.startsWith(`apps${sep}game${sep}public${sep}`) ? await ensurePublicRoot() : await ensureNodeRoot();
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

interface DynamicNodeBuildManifest {
  version: 1;
  bundle: { url: string; hash: string };
  nodes: { nodeTypeId: string; source: string; url: string; hash: string }[];
}

export async function buildDynamicNodeModules(): Promise<{ manifest: DynamicNodeBuildManifest }> {
  setWorkspaceActivity('building-dynamic-nodes', 'Dynamic Node Scripts werden kompiliert ...', true);
  try {
    await ensureDynamicNodeRoot();
    const gameRoot = resolve(workspacePath, 'apps/game');
    const buildScript = resolve(gameRoot, 'scripts/build-dynamic-nodes.mjs');
    assertInsideRoot(buildScript, workspacePath, 'dynamicNodeBuildScript');
    try {
      await execFileAsync(process.execPath, [buildScript], {
        cwd: gameRoot,
        env: process.env,
        maxBuffer: 1024 * 1024 * 8,
      });
    } catch (error) {
      const details = error instanceof Error && 'stderr' in error
        ? String((error as Error & { stderr?: string }).stderr ?? error.message)
        : error instanceof Error ? error.message : String(error);
      throw new EditorBackendError(`Dynamic Node Build fehlgeschlagen:\n${details.trim()}`, 422);
    }
    const manifestPath = resolve(gameRoot, 'public/scripts-compiled/manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as DynamicNodeBuildManifest;
    return { manifest };
  } finally {
    setWorkspaceActivity('ready', 'Git-Workspace bereit.', false);
  }
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
      if (entry.isDirectory()) return await readNodeDirectory(childAbsolutePath, childRelativePath);
      const fileStat = await stat(childAbsolutePath);
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

function isHiddenPublicExplorerEntry(relativePath: string, entryName: string): boolean {
  return relativePath === 'apps/game/public' && entryName === 'scripts-compiled';
}

function isDynamicNodeSourcePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return normalized.startsWith('apps/game/public/scripts/') && /\.tsx?$/.test(normalized);
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

function resolveSceneSourceFile(nodePath: string[]): { filePath: string; nodePath: string[] } {
  const normalizedNodePath = stripRuntimeRootPath(nodePath);
  const sceneMap: Record<string, string> = {
    Menu: 'apps/game/public/scenes/menu.scene.json',
    'Scene.Menu': 'apps/game/public/scenes/menu.scene.json',
    Loading: 'apps/game/public/scenes/loading.scene.json',
    'Scene.Loading': 'apps/game/public/scenes/loading.scene.json',
    Gameplay: 'apps/game/public/scenes/gameplay.scene.json',
    'Scene.Gameplay': 'apps/game/public/scenes/gameplay.scene.json',
    'UI.Gameplay': 'apps/game/public/scenes/gameplay.scene.json',
  };
  const filePath = sceneMap[normalizedNodePath[0]];
  if (!filePath) throw new EditorBackendError(`Runtime prefab instance '${nodePath.join('/')}' has no persistent scene source`, 422);
  return { filePath, nodePath: normalizedNodePath };
}

function findPrefabDeclaration(root: SceneNodeJsonLike, instancePath: readonly string[], prefabPath: string): SceneNodeJsonLike | undefined {
  if (root.name !== instancePath[0]) return undefined;
  let current = root;
  for (const part of instancePath.slice(1, -1)) {
    const child = current.children?.find((candidate) => candidate.name === part);
    if (!child) return undefined;
    current = child;
  }
  return current.children?.find((candidate) => candidate.prefab === prefabPath);
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
  const inventorySlotIndex = normalizedNodePath.findIndex((part) => /^UI\.Slot\d+$/.test(part));
  if (inventorySlotIndex >= 0 && inventorySlotIndex < normalizedNodePath.length - 1) {
    return {
      filePath: 'apps/game/public/prefabs/inventory-slot.prefab.json',
      nodePath: ['InventorySlot', ...normalizedNodePath.slice(inventorySlotIndex + 1)],
    };
  }
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

function findNodeByInstanceId(root: SceneNodeJsonLike, nodeId: string): SceneNodeJsonLike | undefined {
  if (root.nodeId === nodeId) return root;
  for (const child of root.children ?? []) {
    const match = findNodeByInstanceId(child, nodeId);
    if (match) return match;
  }
  return undefined;
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

async function gitBuffer(args: string[]): Promise<Buffer> {
  return new Promise((resolveBuffer, rejectBuffer) => {
    execFile('git', ['-C', workspacePath, ...args], { env: process.env, maxBuffer: 1024 * 1024 * 64, encoding: 'buffer' }, (error, stdout, stderr) => {
      if (error) {
        rejectBuffer(error);
        return;
      }
      if (stderr.length > 0) console.warn('[git]', stderr.toString().trim());
      resolveBuffer(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
    });
  });
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
