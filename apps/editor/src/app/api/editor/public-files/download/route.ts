import { basename } from 'node:path';
import { zipSync } from 'fflate';
import { EditorBackendError, readPublicFile } from '../../../../../server/editorBackend';
import { jsonError } from '../../_response';

export const dynamic = 'force-dynamic';

const maxFiles = 100;
const maxBytes = 200 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const body = await request.json() as { paths?: unknown };
    const paths = Array.isArray(body.paths)
      ? [...new Set(body.paths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0))]
      : [];
    if (paths.length === 0 || paths.length > maxFiles) throw new EditorBackendError('Required: 1 to 100 file paths.', 400);

    const files = await Promise.all(paths.map((path) => readPublicFile(path)));
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    if (totalBytes > maxBytes) throw new EditorBackendError('Download exceeds the 200 MB limit.', 413);

    if (files.length === 1) {
      const file = files[0];
      const name = basename(file.path);
      return new Response(new Uint8Array(file.content), {
        headers: {
          'Cache-Control': 'private, no-store',
          'Content-Type': file.contentType,
          'Content-Length': String(file.size),
          'Content-Disposition': contentDisposition(name),
        },
      });
    }

    const commonParts = commonPathParts(files.map((file) => file.path));
    const entries = Object.fromEntries(files.map((file) => [
      file.path.split('/').slice(commonParts.length).join('/'),
      new Uint8Array(file.content),
    ]));
    const archive = zipSync(entries, { level: 0 });
    return new Response(archive, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/zip',
        'Content-Length': String(archive.byteLength),
        'Content-Disposition': contentDisposition('gravity-dig-assets.zip'),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

function commonPathParts(paths: string[]): string[] {
  const parts = paths.map((path) => path.split('/'));
  const common: string[] = [];
  for (let index = 0; index < Math.min(...parts.map((entry) => entry.length - 1)); index += 1) {
    const value = parts[0][index];
    if (parts.every((entry) => entry[index] === value)) common.push(value);
    else break;
  }
  return common;
}

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^a-zA-Z0-9._-]/gu, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
