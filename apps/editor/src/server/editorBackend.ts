import 'server-only';

import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import type { DebugNodePatch, EditorChange, EditorChangeSet, EditorSetPropsChange } from '@gravity-dig/debug-protocol';

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

const execFileAsync = promisify(execFile);
const changeSets = new Map<string, EditorChangeSet>();
const assetUploads = new Map<string, StagedAssetUpload[]>();

const gitRepoUrl = process.env.EDITOR_GIT_REPO ?? 'https://github.com/MichalSy/gravity-dig-phaser.git';
const gitBranch = process.env.EDITOR_GIT_BRANCH ?? 'main';
const workspacePath = resolve(/* turbopackIgnore: true */ process.env.EDITOR_WORKSPACE ?? '/tmp/gravity-dig-phaser-editor-workspace');
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

export async function saveChangesToGit(sessionId: string, request: SaveRequest) {
  const changeSet = readChangeSet(sessionId);
  const uploads = assetUploads.get(sessionId) ?? [];
  if (changeSet.changes.length === 0 && uploads.length === 0) return { sessionId, saved: false, message: 'No pending changes.' };
  await ensureWorkspace();
  await syncWorkspaceToOrigin();
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
}

export async function gitStatus() {
  await ensureWorkspace();
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
}

export async function readEditorFile(relativePath: string) {
  await ensureWorkspace();
  const safePath = resolveEditablePath(relativePath);
  return { path: safePath.relativePath, content: await readFile(safePath.absolutePath, 'utf8') };
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
  return { id: change.id ?? randomUUID(), kind: 'setProps', sessionId, target: { nodePath }, props: change.props as DebugNodePatch, createdAt: change.createdAt ?? Date.now() };
}

function appendChanges(sessionId: string, changes: EditorSetPropsChange[]): EditorChangeSet {
  const current = readChangeSet(sessionId);
  const compacted = compactChanges([...current.changes, ...changes]);
  const next: EditorChangeSet = { ...current, sessionId, changes: compacted, updatedAt: Date.now() };
  changeSets.set(sessionId, next);
  return next;
}

function compactChanges(changes: EditorChange[]): EditorChange[] {
  const byTarget = new Map<string, EditorSetPropsChange>();
  for (const change of changes) {
    const key = `${change.kind}:${change.target.nodePath.join('/')}`;
    const previous = byTarget.get(key);
    byTarget.set(key, previous ? { ...change, id: previous.id, props: { ...previous.props, ...change.props }, createdAt: previous.createdAt } : change);
  }
  return [...byTarget.values()];
}

async function ensureWorkspace(): Promise<void> {
  assertAllowedRepoRoot(workspacePath);
  if (existsSync(join(workspacePath, '.git'))) return;
  await rm(workspacePath, { recursive: true, force: true });
  await mkdir(dirname(workspacePath), { recursive: true });
  await gitOutside(['clone', '--branch', gitBranch, gitRepoUrl, workspacePath]);
}

async function syncWorkspaceToOrigin(): Promise<void> {
  await git(['fetch', 'origin', gitBranch]);
  await git(['checkout', gitBranch]);
  await git(['reset', '--hard', `origin/${gitBranch}`]);
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
    if (value === null || key === 'sizeMode') delete node.props[key];
    else node.props[key] = value;
  }
  await writeFile(filePath.absolutePath, `${JSON.stringify(file, null, 2)}\n`);
}

async function applyAssetUploadToWorkspace(upload: StagedAssetUpload): Promise<void> {
  const target = resolveEditablePath(upload.assetPath);
  await mkdir(dirname(target.absolutePath), { recursive: true });
  await writeFile(target.absolutePath, await readFile(upload.uploadPath));
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
