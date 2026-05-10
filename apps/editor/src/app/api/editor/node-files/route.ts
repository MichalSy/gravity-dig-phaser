import { listNodeDirectories, listNodeDirectoryFiles, listNodeFiles } from '../../../../server/editorBackend';
import { jsonError, jsonNoStore } from '../_response';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode');
    if (mode === 'directories') return jsonNoStore(await listNodeDirectories());
    if (mode === 'files') return jsonNoStore(await listNodeDirectoryFiles(url.searchParams.get('path') ?? 'apps/game'));
    return jsonNoStore(await listNodeFiles());
  } catch (error) {
    return jsonError(error);
  }
}
