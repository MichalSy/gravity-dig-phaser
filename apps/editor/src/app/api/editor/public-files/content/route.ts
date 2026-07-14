import { readPublicFile } from '../../../../../server/editorBackend';
import { jsonError } from '../../_response';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const path = searchParams.get('path') ?? '';
    const versioned = searchParams.has('contentHash') || searchParams.has('revision') || searchParams.has('atlasRevision') || searchParams.has('cacheBust');
    const file = await readPublicFile(path);
    return new Response(new Uint8Array(file.content), {
      headers: {
        'Cache-Control': versioned ? 'private, max-age=31536000, immutable' : 'private, no-store, max-age=0',
        'Content-Type': file.contentType,
        'Content-Length': String(file.size),
        'X-Editor-File-Path': file.path,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
