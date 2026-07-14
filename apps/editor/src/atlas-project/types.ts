export type AtlasProjectType = 'grid' | 'packed';
export type AtlasOutputFormat = 'png' | 'webp';

export interface AtlasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AtlasProjectFrame {
  id: string;
  source: string;
  slot?: number;
  rect?: AtlasRect;
  pivot?: { x: number; y: number };
}

export interface AtlasProject {
  $schema?: string;
  version: 1;
  type: AtlasProjectType;
  tileWidth?: number;
  tileHeight?: number;
  columns?: number;
  rows?: number;
  width?: number;
  height?: number;
  output: {
    format: AtlasOutputFormat;
    lossless?: boolean;
  };
  frames: AtlasProjectFrame[];
}

export interface AtlasProjectDocument {
  imagePath: string;
  metadataPath: string;
  framesDirectoryPath: string;
  project: AtlasProject;
}

export function atlasProjectPaths(imagePath: string): { imagePath: string; metadataPath: string; framesDirectoryPath: string } {
  const normalized = imagePath.replaceAll('\\', '/');
  const match = normalized.match(/^(.*\.atlas)\.(png|webp)$/i);
  if (!match) throw new Error('Atlas image must use <name>.atlas.png or <name>.atlas.webp.');
  return {
    imagePath: normalized,
    metadataPath: `${match[1]}.json`,
    framesDirectoryPath: `${match[1]}.frames`,
  };
}

export function parseAtlasProject(value: unknown): AtlasProject {
  if (!isRecord(value) || value.version !== 1 || (value.type !== 'grid' && value.type !== 'packed')) throw new Error('Atlas metadata is invalid.');
  if (!isRecord(value.output) || (value.output.format !== 'png' && value.output.format !== 'webp')) throw new Error('Atlas output format is invalid.');
  if (!Array.isArray(value.frames)) throw new Error('Atlas frames must be an array.');

  const frames = value.frames.map((entry, index): AtlasProjectFrame => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id.trim()) throw new Error(`Atlas frame ${index} has no valid id.`);
    if (typeof entry.source !== 'string' || !isSafeSourceName(entry.source)) throw new Error(`Atlas frame '${entry.id}' has an invalid source.`);
    const frame: AtlasProjectFrame = { id: entry.id.trim(), source: entry.source };
    if (entry.slot !== undefined) frame.slot = integer(entry.slot, `Atlas frame '${entry.id}' slot`, 0);
    if (entry.rect !== undefined) frame.rect = parseRect(entry.rect, `Atlas frame '${entry.id}' rect`);
    if (entry.pivot !== undefined) {
      if (!isRecord(entry.pivot) || !finite(entry.pivot.x) || !finite(entry.pivot.y)) throw new Error(`Atlas frame '${entry.id}' pivot is invalid.`);
      frame.pivot = { x: entry.pivot.x, y: entry.pivot.y };
    }
    return frame;
  });

  const ids = new Set<string>();
  const sources = new Set<string>();
  for (const frame of frames) {
    if (ids.has(frame.id)) throw new Error(`Duplicate atlas frame id '${frame.id}'.`);
    if (sources.has(frame.source)) throw new Error(`Duplicate atlas frame source '${frame.source}'.`);
    ids.add(frame.id);
    sources.add(frame.source);
  }

  const project: AtlasProject = {
    ...(typeof value.$schema === 'string' ? { $schema: value.$schema } : {}),
    version: 1,
    type: value.type,
    output: { format: value.output.format, ...(value.output.lossless === true ? { lossless: true } : {}) },
    frames,
  };

  if (project.type === 'grid') {
    project.tileWidth = integer(value.tileWidth, 'Grid tileWidth', 1);
    project.tileHeight = integer(value.tileHeight, 'Grid tileHeight', 1);
    project.columns = integer(value.columns, 'Grid columns', 1);
    project.rows = integer(value.rows, 'Grid rows', 1);
    const slots = new Set<number>();
    for (const frame of frames) {
      if (frame.slot === undefined) throw new Error(`Grid frame '${frame.id}' has no slot.`);
      if (frame.slot >= project.columns * project.rows) throw new Error(`Grid frame '${frame.id}' is outside the atlas.`);
      if (slots.has(frame.slot)) throw new Error(`Grid slot ${frame.slot} is assigned more than once.`);
      if (frame.rect !== undefined) throw new Error(`Grid frame '${frame.id}' must not define a rect.`);
      slots.add(frame.slot);
    }
  } else {
    project.width = integer(value.width, 'Packed atlas width', 1);
    project.height = integer(value.height, 'Packed atlas height', 1);
    for (const frame of frames) {
      if (!frame.rect) throw new Error(`Packed frame '${frame.id}' has no rect.`);
      if (frame.slot !== undefined) throw new Error(`Packed frame '${frame.id}' must not define a slot.`);
      if (frame.rect.x + frame.rect.width > project.width || frame.rect.y + frame.rect.height > project.height) throw new Error(`Packed frame '${frame.id}' is outside the atlas.`);
    }
  }

  return project;
}

export function atlasFrameRect(project: AtlasProject, frame: AtlasProjectFrame): AtlasRect {
  if (project.type === 'packed') return frame.rect!;
  const columns = project.columns!;
  return {
    x: (frame.slot! % columns) * project.tileWidth!,
    y: Math.floor(frame.slot! / columns) * project.tileHeight!,
    width: project.tileWidth!,
    height: project.tileHeight!,
  };
}

export function atlasProjectSize(project: AtlasProject): { width: number; height: number } {
  return project.type === 'grid'
    ? { width: project.columns! * project.tileWidth!, height: project.rows! * project.tileHeight! }
    : { width: project.width!, height: project.height! };
}

function parseRect(value: unknown, label: string): AtlasRect {
  if (!isRecord(value)) throw new Error(`${label} is invalid.`);
  return {
    x: integer(value.x, `${label}.x`, 0),
    y: integer(value.y, `${label}.y`, 0),
    width: integer(value.width, `${label}.width`, 1),
    height: integer(value.height, `${label}.height`, 1),
  };
}

function integer(value: unknown, label: string, minimum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum) throw new Error(`${label} must be an integer >= ${minimum}.`);
  return value as number;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSafeSourceName(value: string): boolean {
  return value.length > 0 && value !== '.' && value !== '..' && !value.includes('/') && !value.includes('\\');
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
