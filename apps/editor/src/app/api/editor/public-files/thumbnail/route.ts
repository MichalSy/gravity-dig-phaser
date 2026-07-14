import sharp from 'sharp';
import { readPublicFile } from '../../../../../server/editorBackend';
import { jsonError } from '../../_response';

export const dynamic = 'force-dynamic';

type ThumbnailCacheEntry = {
  content: Buffer;
  sourceSize: number;
};

const thumbnailCache = new Map<string, ThumbnailCacheEntry>();
const maxCacheEntries = 300;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const path = url.searchParams.get('path') ?? '';
    const size = clamp(Number(url.searchParams.get('size') ?? 128), 48, 256);
    const file = await readPublicFile(path);
    const cacheKey = `${file.path}:${file.modifiedAt}:${file.size}:${size}`;
    const cached = thumbnailCache.get(cacheKey);
    if (cached) return thumbnailResponse(cached.content, file.path, cached.sourceSize);

    const content = await sharp(file.content, { failOn: 'none' })
      .resize(size, size, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72, effort: 3 })
      .toBuffer();
    rememberThumbnail(cacheKey, { content, sourceSize: file.size });
    return thumbnailResponse(content, file.path, file.size);
  } catch (error) {
    return jsonError(error);
  }
}

function thumbnailResponse(content: Buffer, path: string, sourceSize: number): Response {
  return new Response(new Uint8Array(content), {
    headers: {
      'Cache-Control': 'private, max-age=600',
      'Content-Type': 'image/webp',
      'Content-Length': String(content.length),
      'X-Editor-File-Path': path,
      'X-Editor-Source-Size': String(sourceSize),
    },
  });
}

function rememberThumbnail(key: string, entry: ThumbnailCacheEntry): void {
  thumbnailCache.set(key, entry);
  while (thumbnailCache.size > maxCacheEntries) {
    const oldestKey = thumbnailCache.keys().next().value;
    if (!oldestKey) break;
    thumbnailCache.delete(oldestKey);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
