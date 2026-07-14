import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { addAtlasProjectFrame, buildAtlasProject, createAtlasProject, mutateAtlasProject, readAtlasProjectDocument, saveAtlasProjectMetadata } from '../apps/editor/src/atlas-project/server';
import { parseAtlasProject } from '../apps/editor/src/atlas-project/types';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'gravity-atlas-'));
  roots.push(root);
  await mkdir(join(root, 'apps/game/public/assets'), { recursive: true });
  return root;
}

async function solid(width: number, height: number, color: { r: number; g: number; b: number; alpha?: number }): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { ...color, alpha: color.alpha ?? 1 } } }).png().toBuffer();
}

async function pixel(path: string, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(await readFile(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return [...data.subarray(offset, offset + 4)];
}

describe('atlas project generator', () => {
  it('creates explicit image, metadata, and frames-directory companions', async () => {
    const root = await workspace();
    const build = await createAtlasProject(root, {
      directoryPath: 'apps/game/public/assets',
      name: 'characters',
      type: 'packed',
      width: 64,
      height: 32,
      format: 'png',
    });
    expect(build).toMatchObject({ imagePath: 'apps/game/public/assets/characters.atlas.png', metadataPath: 'apps/game/public/assets/characters.atlas.json', framesDirectoryPath: 'apps/game/public/assets/characters.atlas.frames', width: 64, height: 32 });
    expect(JSON.parse(await readFile(join(root, build.metadataPath), 'utf8'))).toMatchObject({ type: 'packed', frames: [] });
    expect(await pixel(join(root, build.imagePath), 0, 0)).toEqual([0, 0, 0, 0]);
    const originalMetadata = await readFile(join(root, build.metadataPath), 'utf8');
    await expect(saveAtlasProjectMetadata(root, build.metadataPath, '{ invalid')).rejects.toThrow();
    expect(await readFile(join(root, build.metadataPath), 'utf8')).toBe(originalMetadata);
    await expect(createAtlasProject(root, { directoryPath: 'apps/game/public/assets', name: 'characters', type: 'packed' })).rejects.toThrow('already exists');
  });

  it('builds stable grid slots and swaps frames without renumbering other slots', async () => {
    const root = await workspace();
    const directory = join(root, 'apps/game/public/assets');
    await mkdir(join(directory, 'terrain.atlas.frames'));
    await writeFile(join(directory, 'terrain.atlas.frames/dirt.png'), await solid(2, 2, { r: 120, g: 70, b: 20 }));
    await writeFile(join(directory, 'terrain.atlas.frames/stone.png'), await solid(2, 2, { r: 80, g: 90, b: 100 }));
    await writeFile(join(directory, 'terrain.atlas.json'), JSON.stringify({
      version: 1,
      type: 'grid',
      tileWidth: 2,
      tileHeight: 2,
      columns: 3,
      rows: 2,
      output: { format: 'webp', lossless: true },
      frames: [
        { id: 'dirt', source: 'dirt.png', slot: 1 },
        { id: 'stone', source: 'stone.png', slot: 4 },
      ],
    }));

    const imagePath = 'apps/game/public/assets/terrain.atlas.webp';
    const first = await buildAtlasProject(root, imagePath);
    expect(first).toMatchObject({ frameCount: 2, width: 6, height: 4 });
    expect(await pixel(join(directory, 'terrain.atlas.webp'), 2, 0)).toEqual([120, 70, 20, 255]);
    expect(await pixel(join(directory, 'terrain.atlas.webp'), 2, 2)).toEqual([80, 90, 100, 255]);

    await addAtlasProjectFrame(root, imagePath, {
      name: 'replacement.png',
      content: await solid(5, 3, { r: 40, g: 160, b: 70 }),
      replaceFrameId: 'dirt',
    });
    expect(await sharp(await readFile(join(directory, 'terrain.atlas.frames/dirt.png'))).metadata()).toMatchObject({ width: 5, height: 3 });
    expect(await pixel(join(directory, 'terrain.atlas.webp'), 2, 0)).toEqual([40, 160, 70, 255]);
    expect(await pixel(join(directory, 'terrain.atlas.webp'), 3, 1)).toEqual([40, 160, 70, 255]);

    await mutateAtlasProject(root, imagePath, { operation: 'move-frame', frameId: 'dirt', slot: 4 });
    const metadata = JSON.parse(await readFile(join(directory, 'terrain.atlas.json'), 'utf8'));
    expect(metadata.frames).toEqual([
      { id: 'dirt', source: 'dirt.png', slot: 4 },
      { id: 'stone', source: 'stone.png', slot: 1 },
    ]);
    expect(await pixel(join(directory, 'terrain.atlas.webp'), 2, 0)).toEqual([80, 90, 100, 255]);
  });

  it('adds, moves, resizes, and deletes packed frames with their source files', async () => {
    const root = await workspace();
    const directory = join(root, 'apps/game/public/assets');
    await mkdir(join(directory, 'effects.atlas.frames'));
    await writeFile(join(directory, 'effects.atlas.json'), JSON.stringify({
      version: 1,
      type: 'packed',
      width: 8,
      height: 8,
      output: { format: 'png' },
      frames: [],
    }));
    await writeFile(join(directory, 'effects.atlas.png'), await solid(8, 8, { r: 0, g: 0, b: 0, alpha: 0 }));
    const imagePath = 'apps/game/public/assets/effects.atlas.png';

    await addAtlasProjectFrame(root, imagePath, { name: 'spark.png', content: await solid(2, 3, { r: 255, g: 20, b: 10 }), x: 1, y: 2 });
    expect(await pixel(join(directory, 'effects.atlas.png'), 1, 2)).toEqual([255, 20, 10, 255]);
    await mutateAtlasProject(root, imagePath, { operation: 'move-frame', frameId: 'spark', x: 5, y: 4 });
    expect(await pixel(join(directory, 'effects.atlas.png'), 5, 4)).toEqual([255, 20, 10, 255]);
    await mutateAtlasProject(root, imagePath, { operation: 'resize', width: 10, height: 9 });
    await mutateAtlasProject(root, imagePath, { operation: 'delete-frame', frameId: 'spark' });
    const metadata = JSON.parse(await readFile(join(directory, 'effects.atlas.json'), 'utf8'));
    expect(metadata).toMatchObject({ width: 10, height: 9, frames: [] });
    await expect(readFile(join(directory, 'effects.atlas.frames/spark.png'))).rejects.toThrow();
  });

  it('names sources after unique frame ids and revisions only the changed frame hash', async () => {
    const root = await workspace();
    const directory = join(root, 'apps/game/public/assets');
    await mkdir(join(directory, 'named.atlas.frames'));
    await writeFile(join(directory, 'named.atlas.json'), JSON.stringify({
      version: 1,
      type: 'grid', tileWidth: 2, tileHeight: 2, columns: 2, rows: 1,
      output: { format: 'png' },
      frames: [],
    }));
    await writeFile(join(directory, 'named.atlas.png'), await solid(4, 2, { r: 0, g: 0, b: 0, alpha: 0 }));
    const imagePath = 'apps/game/public/assets/named.atlas.png';

    await addAtlasProjectFrame(root, imagePath, { name: 'same upload.png', content: await solid(2, 2, { r: 10, g: 20, b: 30 }), slot: 0 });
    await addAtlasProjectFrame(root, imagePath, { name: 'same upload.png', content: await solid(2, 2, { r: 40, g: 50, b: 60 }), slot: 1 });
    const before = await readAtlasProjectDocument(root, imagePath);
    expect(before.project.frames).toEqual([
      { id: 'same-upload', source: 'same-upload.png', slot: 0 },
      { id: 'same-upload-2', source: 'same-upload-2.png', slot: 1 },
    ]);

    const replacement = await sharp(await solid(2, 2, { r: 70, g: 80, b: 90 })).webp().toBuffer();
    await addAtlasProjectFrame(root, imagePath, { name: 'irrelevant-file-name.webp', content: replacement, replaceFrameId: 'same-upload' });
    const after = await readAtlasProjectDocument(root, imagePath);
    expect(after.project.frames[0]).toEqual({ id: 'same-upload', source: 'same-upload.webp', slot: 0 });
    expect(after.sourceHashes?.['same-upload']).not.toBe(before.sourceHashes?.['same-upload']);
    expect(after.sourceHashes?.['same-upload-2']).toBe(before.sourceHashes?.['same-upload-2']);
    await expect(readFile(join(directory, 'named.atlas.frames/same-upload.png'))).rejects.toThrow();
    expect(await readFile(join(directory, 'named.atlas.frames/same-upload.webp'))).toBeTruthy();
  });

  it('rejects symlinked frame sources and paths outside public', async () => {
    const root = await workspace();
    const directory = join(root, 'apps/game/public/assets');
    const outside = join(root, 'outside.png');
    await writeFile(outside, await solid(2, 2, { r: 255, g: 0, b: 0 }));
    await mkdir(join(directory, 'unsafe.atlas.frames'));
    await symlink(outside, join(directory, 'unsafe.atlas.frames/linked.png'));
    await writeFile(join(directory, 'unsafe.atlas.json'), JSON.stringify({
      version: 1,
      type: 'grid', tileWidth: 2, tileHeight: 2, columns: 1, rows: 1,
      output: { format: 'png' },
      frames: [{ id: 'linked', source: 'linked.png', slot: 0 }],
    }));
    await expect(buildAtlasProject(root, 'apps/game/public/assets/unsafe.atlas.png')).rejects.toThrow('does not exist');
    await expect(createAtlasProject(root, { directoryPath: '../outside', name: 'escape', type: 'grid' })).rejects.toThrow('inside apps/game/public');
  });

  it('rejects duplicate grid slots and unsafe frame sources', () => {
    expect(() => parseAtlasProject({
      version: 1,
      type: 'grid', tileWidth: 16, tileHeight: 16, columns: 2, rows: 1,
      output: { format: 'png' },
      frames: [
        { id: 'a', source: 'a.png', slot: 0 },
        { id: 'b', source: 'b.png', slot: 0 },
      ],
    })).toThrow('assigned more than once');
    expect(() => parseAtlasProject({
      version: 1,
      type: 'packed', width: 32, height: 32,
      output: { format: 'png' },
      frames: [{ id: 'escape', source: '../escape.png', rect: { x: 0, y: 0, width: 1, height: 1 } }],
    })).toThrow('invalid source');
  });
});
