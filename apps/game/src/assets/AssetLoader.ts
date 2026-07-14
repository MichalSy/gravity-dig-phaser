import Phaser from 'phaser';
import type { FontAssetDefinition, ImageAssetDefinition } from '@gravity-dig/game-core';
import { animationSetMetaKey, type AnimationSetDefinition } from './animationSetMeta';
import { imageAtlasMetaKey, imageAtlasMetaPath } from './imageAtlasMeta';

export const ASSET_MANIFEST_KEY = 'game:asset-manifest';
const ASSET_VERSION = Date.now().toString(36);

interface AudioAssetDefinition {
  key: string;
  path: string;
}

interface JsonAssetDefinition {
  key: string;
  path: string;
}

export interface PublicAssetGroup {
  images: ImageAssetDefinition[];
  audio: AudioAssetDefinition[];
  json: JsonAssetDefinition[];
  animationSets: AnimationSetDefinition[];
  fontManifests: string[];
}

export interface PublicAssetManifest {
  version: 1;
  groups: Record<string, PublicAssetGroup>;
}

export interface RuntimeAssetDefinitions {
  images: ImageAssetDefinition[];
  animationSets: AnimationSetDefinition[];
  fonts: FontAssetDefinition[];
}

export function parsePublicAssetManifest(value: unknown): PublicAssetManifest {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.groups)) throw new Error('Asset manifest is invalid');
  const groups: Record<string, PublicAssetGroup> = {};
  for (const [id, rawGroup] of Object.entries(value.groups)) {
    if (!isRecord(rawGroup)) throw new Error(`Asset group '${id}' is invalid`);
    groups[id] = {
      images: parseKeyPathAssets(rawGroup.images, id, 'images') as ImageAssetDefinition[],
      audio: parseKeyPathAssets(rawGroup.audio, id, 'audio'),
      json: parseKeyPathAssets(rawGroup.json, id, 'json'),
      animationSets: parseKeyPathAssets(rawGroup.animationSets, id, 'animationSets'),
      fontManifests: parseStringArray(rawGroup.fontManifests, id, 'fontManifests'),
    };
  }
  return { version: 1, groups };
}

export async function loadAssetGroups(
  scene: Phaser.Scene,
  manifest: PublicAssetManifest,
  groupIds: readonly string[],
  onProgress?: (progress: number) => void,
  resolveAssetPath: (path: string) => string = versioned,
): Promise<void> {
  if (groupIds.length === 0) {
    onProgress?.(1);
    return;
  }
  const groups = resolveGroups(manifest, groupIds);
  let queued = false;
  for (const group of groups) {
    for (const asset of group.images) {
      if (!scene.textures.exists(asset.key)) {
        scene.load.image(asset.key, resolveAssetPath(asset.path));
        queued = true;
      }
      if (asset.meta && !scene.cache.json.exists(imageAtlasMetaKey(asset.key))) {
        scene.load.json(imageAtlasMetaKey(asset.key), resolveAssetPath(imageAtlasMetaPath(asset.path)));
        queued = true;
      }
    }
    for (const asset of group.audio) if (!scene.cache.audio.exists(asset.key)) {
      scene.load.audio(asset.key, resolveAssetPath(asset.path));
      queued = true;
    }
    for (const asset of group.json) if (!scene.cache.json.exists(asset.key)) {
      scene.load.json(asset.key, resolveAssetPath(asset.path));
      queued = true;
    }
    for (const set of group.animationSets) {
      const key = animationSetMetaKey(set.key);
      if (!scene.cache.json.exists(key)) {
        scene.load.json(key, resolveAssetPath(set.path));
        queued = true;
      }
    }
    for (const path of group.fontManifests) {
      const key = fontManifestCacheKey(path);
      if (!scene.cache.json.exists(key)) {
        scene.load.json(key, resolveAssetPath(path));
        queued = true;
      }
    }
  }

  onProgress?.(0);
  if (!queued) {
    onProgress?.(1);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const progress = (value: number): void => onProgress?.(value);
    const complete = (): void => {
      scene.load.off(Phaser.Loader.Events.PROGRESS, progress);
      scene.load.off('loaderror', failed);
      onProgress?.(1);
      resolve();
    };
    const failed = (file: Phaser.Loader.File): void => {
      scene.load.off(Phaser.Loader.Events.PROGRESS, progress);
      scene.load.off(Phaser.Loader.Events.COMPLETE, complete);
      reject(new Error(`Asset '${file.key}' could not be loaded`));
    };
    scene.load.on(Phaser.Loader.Events.PROGRESS, progress);
    scene.load.once(Phaser.Loader.Events.COMPLETE, complete);
    scene.load.once('loaderror', failed);
    scene.load.start();
  });
}

export function runtimeAssetDefinitions(scene: Phaser.Scene, manifest: PublicAssetManifest, groupIds: readonly string[]): RuntimeAssetDefinitions {
  const groups = resolveGroups(manifest, groupIds);
  const images = dedupeByKey(groups.flatMap((group) => group.images));
  const animationSets = dedupeByKey(groups.flatMap((group) => group.animationSets));
  const fonts = dedupeByKey(groups.flatMap((group) => group.fontManifests.flatMap((path) => {
    const value = scene.cache.json.get(fontManifestCacheKey(path)) as { fonts?: FontAssetDefinition[] } | undefined;
    return (value?.fonts ?? []).map((font) => ({ ...font, path: publicAssetPath(font.path) }));
  })));
  return { images, animationSets, fonts };
}

function resolveGroups(manifest: PublicAssetManifest, groupIds: readonly string[]): PublicAssetGroup[] {
  return [...new Set(groupIds)].map((id) => {
    const group = manifest.groups[id];
    if (!group) throw new Error(`Unknown asset group '${id}'`);
    return group;
  });
}

function fontManifestCacheKey(path: string): string {
  return `asset-font-manifest:${path}`;
}

function publicAssetPath(path: string): string {
  if (!path.startsWith('/')) return path;
  const base = import.meta.env.BASE_URL || '/';
  if (base === '/') return path;
  return `${base.replace(/\/$/u, '')}${path}`;
}

function versioned(path: string): string {
  const resolvedPath = publicAssetPath(path);
  const separator = resolvedPath.includes('?') ? '&' : '?';
  return `${resolvedPath}${separator}v=${ASSET_VERSION}`;
}

function parseKeyPathAssets(value: unknown, groupId: string, field: string): Array<{ key: string; path: string; meta?: boolean }> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Asset group '${groupId}' has invalid ${field}`);
  return value.map((entry) => {
    if (!isRecord(entry) || typeof entry.key !== 'string' || typeof entry.path !== 'string') {
      throw new Error(`Asset group '${groupId}' has invalid ${field} entry`);
    }
    return { key: entry.key, path: entry.path, ...(entry.meta === true ? { meta: true } : {}) };
  });
}

function parseStringArray(value: unknown, groupId: string, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) throw new Error(`Asset group '${groupId}' has invalid ${field}`);
  return [...value];
}

function dedupeByKey<T extends { key: string }>(values: readonly T[]): T[] {
  return [...new Map(values.map((value) => [value.key, value])).values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
