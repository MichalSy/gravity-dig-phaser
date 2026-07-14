import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import {
  atlasFrameRect,
  atlasProjectPaths,
  atlasProjectSize,
  parseAtlasProject,
  type AtlasProject,
  type AtlasProjectDocument,
  type AtlasProjectFrame,
} from './types';

export type AtlasMutation =
  | { operation: 'move-frame'; frameId: string; slot?: number; x?: number; y?: number }
  | { operation: 'delete-frame'; frameId: string; deleteSource?: boolean }
  | { operation: 'resize'; columns?: number; rows?: number; width?: number; height?: number };

export interface AtlasFrameUpload {
  name: string;
  content: Buffer;
  slot?: number;
  x?: number;
  y?: number;
  replaceFrameId?: string;
}

export interface AtlasCreateOptions {
  directoryPath: string;
  name: string;
  type: 'grid' | 'packed';
  format?: 'png' | 'webp';
  tileWidth?: number;
  tileHeight?: number;
  columns?: number;
  rows?: number;
  width?: number;
  height?: number;
}

export interface AtlasBuildResult {
  imagePath: string;
  metadataPath: string;
  framesDirectoryPath: string;
  frameCount: number;
  width: number;
  height: number;
}

export async function createAtlasProject(workspacePath: string, options: AtlasCreateOptions): Promise<AtlasBuildResult> {
  const directoryPath = normalizePublicPath(options.directoryPath);
  await resolveExistingDirectoryPath(workspacePath, directoryPath);
  const name = options.name.trim().replace(/\.atlas$/i, '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) throw new Error('Atlas name may contain only letters, numbers, dots, underscores, and dashes.');
  const format = options.format ?? 'webp';
  const imagePath = `${directoryPath}/${name}.atlas.${format}`;
  const paths = atlasProjectPaths(imagePath);
  for (const path of [paths.imagePath, paths.metadataPath, paths.framesDirectoryPath]) {
    if (await lstat(resolvePublicPath(workspacePath, path)).catch(() => undefined)) throw new Error(`Atlas companion already exists: ${path}`);
  }
  const schema = relative(dirname(paths.metadataPath), 'apps/game/public/schemas/atlas-project.schema.json').replaceAll('\\', '/');
  const project = parseAtlasProject(options.type === 'grid' ? {
    $schema: schema,
    version: 1,
    type: 'grid',
    tileWidth: positiveInteger(options.tileWidth ?? 96, 'tileWidth'),
    tileHeight: positiveInteger(options.tileHeight ?? 96, 'tileHeight'),
    columns: positiveInteger(options.columns ?? 8, 'columns'),
    rows: positiveInteger(options.rows ?? 1, 'rows'),
    output: { format, lossless: true },
    frames: [],
  } : {
    $schema: schema,
    version: 1,
    type: 'packed',
    width: positiveInteger(options.width ?? 1024, 'width'),
    height: positiveInteger(options.height ?? 1024, 'height'),
    output: { format, lossless: true },
    frames: [],
  });
  const framesDirectory = resolvePublicPath(workspacePath, paths.framesDirectoryPath);
  await mkdir(framesDirectory);
  try {
    return await commitAtlasProject(workspacePath, { ...paths, project }, new Map());
  } catch (error) {
    await rm(framesDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function saveAtlasProjectMetadata(workspacePath: string, metadataPath: string, content: string): Promise<AtlasBuildResult> {
  const normalizedMetadataPath = normalizePublicPath(metadataPath);
  if (!/\.atlas\.json$/i.test(normalizedMetadataPath)) throw new Error('Atlas metadata path must end with .atlas.json.');
  const project = parseAtlasProject(JSON.parse(content));
  const imagePath = normalizedMetadataPath.replace(/\.json$/i, `.${project.output.format}`);
  const paths = atlasProjectPaths(imagePath);
  if (paths.metadataPath !== normalizedMetadataPath) throw new Error('Atlas metadata and output paths do not share a stem.');
  await resolveExistingDirectoryPath(workspacePath, paths.framesDirectoryPath);
  return commitAtlasProject(workspacePath, { ...paths, project }, new Map());
}

export async function readAtlasProjectDocument(workspacePath: string, imagePath: string): Promise<AtlasProjectDocument> {
  const paths = atlasProjectPaths(normalizePublicPath(imagePath));
  const metadataPath = await resolveExistingRegularPath(workspacePath, paths.metadataPath);
  const framesDirectoryPath = await resolveExistingDirectoryPath(workspacePath, paths.framesDirectoryPath);
  const project = parseAtlasProject(JSON.parse(await readFile(metadataPath, 'utf8')));
  if (paths.imagePath.toLowerCase().endsWith(`.${project.output.format}`) === false) throw new Error(`Atlas output format '${project.output.format}' does not match ${paths.imagePath}.`);
  const sourceHashes = Object.fromEntries(await Promise.all(project.frames.map(async (frame) => {
    const content = await readFile(await resolveExistingRegularPath(workspacePath, `${paths.framesDirectoryPath}/${frame.source}`));
    return [frame.id, createHash('sha256').update(content).digest('hex')] as const;
  })));
  return { ...paths, project, sourceHashes };
}

export async function buildAtlasProject(workspacePath: string, imagePath: string): Promise<AtlasBuildResult> {
  const document = await readAtlasProjectDocument(workspacePath, imagePath);
  const image = await renderAtlas(workspacePath, document);
  await commitFileChanges(workspacePath, [{ path: document.imagePath, content: image }]);
  const size = atlasProjectSize(document.project);
  return { imagePath: document.imagePath, metadataPath: document.metadataPath, framesDirectoryPath: document.framesDirectoryPath, frameCount: document.project.frames.length, ...size };
}

export async function mutateAtlasProject(workspacePath: string, imagePath: string, mutation: AtlasMutation): Promise<AtlasBuildResult> {
  const document = await readAtlasProjectDocument(workspacePath, imagePath);
  const project = structuredClone(document.project);
  const sourceChanges = new Map<string, Buffer | null>();

  if (mutation.operation === 'move-frame') {
    const frame = requireFrame(project, mutation.frameId);
    if (project.type === 'grid') {
      if (!Number.isInteger(mutation.slot) || mutation.slot! < 0 || mutation.slot! >= project.columns! * project.rows!) throw new Error('Target grid slot is invalid.');
      const occupied = project.frames.find((candidate) => candidate.id !== frame.id && candidate.slot === mutation.slot);
      if (occupied) {
        const previousSlot = frame.slot;
        frame.slot = occupied.slot;
        occupied.slot = previousSlot;
      } else frame.slot = mutation.slot;
    } else {
      if (!Number.isInteger(mutation.x) || !Number.isInteger(mutation.y) || mutation.x! < 0 || mutation.y! < 0) throw new Error('Target atlas position is invalid.');
      frame.rect = { ...frame.rect!, x: mutation.x!, y: mutation.y! };
    }
  } else if (mutation.operation === 'delete-frame') {
    const frame = requireFrame(project, mutation.frameId);
    project.frames = project.frames.filter((candidate) => candidate.id !== frame.id);
    if (mutation.deleteSource !== false) sourceChanges.set(frame.source, null);
  } else if (project.type === 'grid') {
    const columns = positiveInteger(mutation.columns ?? project.columns, 'columns');
    const rows = positiveInteger(mutation.rows ?? project.rows, 'rows');
    const highestSlot = Math.max(-1, ...project.frames.map((frame) => frame.slot!));
    if (highestSlot >= columns * rows) throw new Error('The resized grid would cut off assigned frame slots.');
    project.columns = columns;
    project.rows = rows;
  } else {
    const width = positiveInteger(mutation.width ?? project.width, 'width');
    const height = positiveInteger(mutation.height ?? project.height, 'height');
    if (project.frames.some((frame) => frame.rect!.x + frame.rect!.width > width || frame.rect!.y + frame.rect!.height > height)) throw new Error('The resized canvas would cut off frames.');
    project.width = width;
    project.height = height;
  }

  return commitAtlasProject(workspacePath, { ...document, project: parseAtlasProject(project) }, sourceChanges);
}

export async function addAtlasProjectFrame(workspacePath: string, imagePath: string, upload: AtlasFrameUpload): Promise<AtlasBuildResult> {
  if (upload.content.length === 0 || upload.content.length > 32 * 1024 * 1024) throw new Error('Atlas frame must be between 1 byte and 32 MB.');
  const document = await readAtlasProjectDocument(workspacePath, imagePath);
  const project = structuredClone(document.project);
  const metadata = await sharp(upload.content).metadata();
  if (!metadata.width || !metadata.height) throw new Error('Atlas frame image dimensions could not be read.');
  const sourceChanges = new Map<string, Buffer | null>();

  if (upload.replaceFrameId) {
    const frame = requireFrame(project, upload.replaceFrameId);
    if (project.type === 'packed') frame.rect = { ...frame.rect!, width: metadata.width, height: metadata.height };
    const extension = extname(safeSourceName(upload.name)).toLowerCase();
    const source = `${frame.id}${extension}`;
    const occupied = project.frames.find((candidate) => candidate.id !== frame.id && candidate.source === source);
    if (occupied) throw new Error(`Atlas source '${source}' already belongs to frame '${occupied.id}'.`);
    if (source !== frame.source) sourceChanges.set(frame.source, null);
    frame.source = source;
    sourceChanges.set(source, upload.content);
  } else {
    const uploadedSource = safeSourceName(upload.name);
    const extension = extname(uploadedSource).toLowerCase();
    const id = uniqueFrameId(project, uploadedSource.replace(/\.[^.]+$/u, ''));
    const source = `${id}${extension}`;
    let frame: AtlasProjectFrame;
    if (project.type === 'grid') {
      if (!Number.isInteger(upload.slot) || upload.slot! < 0 || upload.slot! >= project.columns! * project.rows!) throw new Error('Target grid slot is invalid.');
      if (project.frames.some((candidate) => candidate.slot === upload.slot)) throw new Error(`Grid slot ${upload.slot} is occupied.`);
      frame = { id, source, slot: upload.slot };
    } else {
      const x = Number.isInteger(upload.x) ? upload.x! : 0;
      const y = Number.isInteger(upload.y) ? upload.y! : 0;
      if (x < 0 || y < 0 || x + metadata.width > project.width! || y + metadata.height > project.height!) throw new Error('The new frame is outside the packed atlas canvas.');
      frame = { id, source, rect: { x, y, width: metadata.width, height: metadata.height } };
    }
    project.frames.push(frame);
    sourceChanges.set(source, upload.content);
  }

  return commitAtlasProject(workspacePath, { ...document, project: parseAtlasProject(project) }, sourceChanges);
}

export async function rebuildAtlasProjectsForPaths(workspacePath: string, changedPaths: readonly string[]): Promise<{ builds: AtlasBuildResult[]; errors: string[] }> {
  const metadataPaths = new Set<string>();
  for (const rawPath of changedPaths) {
    const path = rawPath.replaceAll('\\', '/');
    const metadataMatch = path.match(/^(.*\.atlas)\.json$/i);
    if (metadataMatch) metadataPaths.add(path);
    const imageMatch = path.match(/^(.*\.atlas)\.(?:png|webp)$/i);
    if (imageMatch) metadataPaths.add(`${imageMatch[1]}.json`);
    const frameMatch = path.match(/^(.*\.atlas)\.frames\/[^/]+$/i);
    if (frameMatch) metadataPaths.add(`${frameMatch[1]}.json`);
  }

  const builds: AtlasBuildResult[] = [];
  const errors: string[] = [];
  for (const metadataPath of metadataPaths) {
    try {
      const absoluteMetadataPath = await resolveExistingRegularPath(workspacePath, metadataPath);
      const project = parseAtlasProject(JSON.parse(await readFile(absoluteMetadataPath, 'utf8')));
      const imagePath = metadataPath.replace(/\.json$/i, `.${project.output.format}`);
      builds.push(await buildAtlasProject(workspacePath, imagePath));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { builds, errors };
}

async function commitAtlasProject(workspacePath: string, document: AtlasProjectDocument, sourceChanges: Map<string, Buffer | null>): Promise<AtlasBuildResult> {
  const image = await renderAtlas(workspacePath, document, sourceChanges);
  const metadata = Buffer.from(`${JSON.stringify(document.project, null, 2)}\n`);
  const changes: Array<{ path: string; content: Buffer | null }> = [
    { path: document.metadataPath, content: metadata },
    { path: document.imagePath, content: image },
    ...[...sourceChanges].map(([source, content]) => ({ path: `${document.framesDirectoryPath}/${source}`, content })),
  ];
  await commitFileChanges(workspacePath, changes);
  const size = atlasProjectSize(document.project);
  return { imagePath: document.imagePath, metadataPath: document.metadataPath, framesDirectoryPath: document.framesDirectoryPath, frameCount: document.project.frames.length, ...size };
}

async function renderAtlas(workspacePath: string, document: AtlasProjectDocument, sourceChanges = new Map<string, Buffer | null>()): Promise<Buffer> {
  const size = atlasProjectSize(document.project);
  const composites = await Promise.all(document.project.frames.map(async (frame) => {
    const override = sourceChanges.get(frame.source);
    if (override === null) throw new Error(`Atlas frame '${frame.id}' source is deleted but still referenced.`);
    const input = override ?? await readFile(await resolveExistingRegularPath(workspacePath, `${document.framesDirectoryPath}/${frame.source}`));
    const rect = atlasFrameRect(document.project, frame);
    const metadata = await sharp(input).metadata();
    if (!metadata.width || !metadata.height) throw new Error(`Atlas frame '${frame.id}' dimensions could not be read.`);
    const rendered = metadata.width === rect.width && metadata.height === rect.height ? input : await sharp(input).resize(rect.width, rect.height, { fit: 'fill' }).png().toBuffer();
    return { input: rendered, left: rect.x, top: rect.y };
  }));

  let pipeline = sharp({ create: { width: size.width, height: size.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites);
  pipeline = document.project.output.format === 'webp'
    ? pipeline.webp({ lossless: document.project.output.lossless !== false })
    : pipeline.png();
  return pipeline.toBuffer();
}

async function commitFileChanges(workspacePath: string, changes: Array<{ path: string; content: Buffer | null }>): Promise<void> {
  const transactionId = randomUUID();
  const staged: Array<{ absolutePath: string; tempPath?: string; backupPath: string; existed: boolean; content: Buffer | null }> = [];
  try {
    for (const change of changes) {
      const absolutePath = resolvePublicPath(workspacePath, change.path);
      await mkdir(dirname(absolutePath), { recursive: true });
      const existing = await lstat(absolutePath).catch(() => undefined);
      if (existing?.isSymbolicLink() || (existing && !existing.isFile())) throw new Error(`Atlas target is not a regular file: ${change.path}`);
      const tempPath = change.content === null ? undefined : `${absolutePath}.atlas-temp-${transactionId}`;
      if (tempPath) await writeNewFile(tempPath, change.content!);
      staged.push({ absolutePath, tempPath, backupPath: `${absolutePath}.atlas-backup-${transactionId}`, existed: Boolean(existing), content: change.content });
    }
    const committed: typeof staged = [];
    try {
      for (const entry of staged) {
        if (entry.existed) await rename(entry.absolutePath, entry.backupPath);
        try {
          if (entry.tempPath) await rename(entry.tempPath, entry.absolutePath);
        } catch (error) {
          if (entry.existed) await rename(entry.backupPath, entry.absolutePath).catch(() => undefined);
          throw error;
        }
        committed.push(entry);
      }
    } catch (error) {
      for (const entry of committed.reverse()) {
        await rm(entry.absolutePath, { force: true });
        if (entry.existed) await rename(entry.backupPath, entry.absolutePath).catch(() => undefined);
      }
      throw error;
    }
    for (const entry of staged) if (entry.existed) await rm(entry.backupPath, { force: true });
  } finally {
    for (const entry of staged) {
      if (entry.tempPath) await rm(entry.tempPath, { force: true });
      await rm(entry.backupPath, { force: true });
    }
  }
}

async function writeNewFile(path: string, content: Buffer): Promise<void> {
  const handle = await open(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(content); } finally { await handle.close(); }
}

async function resolveExistingRegularPath(workspacePath: string, relativePath: string): Promise<string> {
  const absolutePath = resolvePublicPath(workspacePath, relativePath);
  const fileStat = await lstat(absolutePath).catch(() => undefined);
  if (!fileStat?.isFile() || fileStat.isSymbolicLink()) throw new Error(`Atlas file does not exist: ${relativePath}`);
  await assertRealInsidePublic(workspacePath, absolutePath);
  return absolutePath;
}

async function resolveExistingDirectoryPath(workspacePath: string, relativePath: string): Promise<string> {
  const absolutePath = resolvePublicPath(workspacePath, relativePath);
  const fileStat = await lstat(absolutePath).catch(() => undefined);
  if (!fileStat?.isDirectory() || fileStat.isSymbolicLink()) throw new Error(`Atlas frames directory does not exist: ${relativePath}`);
  await assertRealInsidePublic(workspacePath, absolutePath);
  return absolutePath;
}

function resolvePublicPath(workspacePath: string, relativePath: string): string {
  const normalized = normalizePublicPath(relativePath);
  const root = resolve(workspacePath, 'apps/game/public');
  const absolutePath = resolve(workspacePath, normalized);
  if (absolutePath !== root && !absolutePath.startsWith(`${root}/`)) throw new Error('Atlas path escapes the public project root.');
  return absolutePath;
}

async function assertRealInsidePublic(workspacePath: string, absolutePath: string): Promise<void> {
  const [realTarget, realRoot] = await Promise.all([realpath(absolutePath), realpath(resolve(workspacePath, 'apps/game/public'))]);
  if (realTarget !== realRoot && !realTarget.startsWith(`${realRoot}/`)) throw new Error('Atlas path resolves outside the public project root.');
}

function normalizePublicPath(path: string): string {
  const normalized = path.replace(/^\/+/, '').replaceAll('\\', '/');
  if (!normalized.startsWith('apps/game/public/') || normalized.split('/').includes('..')) throw new Error('Atlas projects must live inside apps/game/public.');
  return normalized;
}

function requireFrame(project: AtlasProject, frameId: string): AtlasProjectFrame {
  const frame = project.frames.find((candidate) => candidate.id === frameId);
  if (!frame) throw new Error(`Unknown atlas frame '${frameId}'.`);
  return frame;
}

function safeSourceName(name: string): string {
  const source = basename(name.trim()).replace(/[^a-zA-Z0-9._-]/gu, '-');
  if (!source || source === '.' || source === '..' || !['.png', '.webp', '.jpg', '.jpeg'].includes(extname(source).toLowerCase())) throw new Error('Atlas frame filename is invalid.');
  return source;
}

function uniqueFrameId(project: AtlasProject, requested: string): string {
  const base = requested.replace(/[^a-zA-Z0-9._-]/gu, '-').replace(/^-+|-+$/gu, '') || 'frame';
  let id = base;
  let suffix = 2;
  while (project.frames.some((frame) => frame.id === id)) id = `${base}-${suffix++}`;
  return id;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error(`Atlas ${label} must be a positive integer.`);
  return value as number;
}
