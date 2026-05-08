import { readPublicFile } from '../../../../../server/editorBackend';
import { jsonError } from '../../_response';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const path = new URL(request.url).searchParams.get('path') ?? '';
    const file = await readPublicFile(path);
    return new Response(new Uint8Array(file.content), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': file.contentType,
        'Content-Length': String(file.size),
        'X-Editor-File-Path': file.path,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
