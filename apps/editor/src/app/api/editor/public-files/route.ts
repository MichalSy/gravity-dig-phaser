import { listPublicDirectories, listPublicDirectoryFiles, listPublicFiles } from '../../../../server/editorBackend';
import { jsonError, jsonNoStore } from '../_response';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode');
    if (mode === 'directories') return jsonNoStore(await listPublicDirectories());
    if (mode === 'files') return jsonNoStore(await listPublicDirectoryFiles(url.searchParams.get('path') ?? 'apps/game/public'));
    return jsonNoStore(await listPublicFiles());
  } catch (error) {
    return jsonError(error);
  }
}
