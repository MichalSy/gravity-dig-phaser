import { deleteExplorerFiles, listPublicDirectories, listPublicDirectoryFiles, listPublicFiles, uploadExplorerFiles } from '../../../../server/editorBackend';
import { jsonError, jsonNoStore, readJson } from '../_response';

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

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const directoryPath = String(form.get('directoryPath') ?? '').trim();
    const files = await Promise.all(form.getAll('files').filter((value): value is File => value instanceof File).map(async (file) => ({
      name: file.name,
      content: Buffer.from(await file.arrayBuffer()),
    })));
    return jsonNoStore(await uploadExplorerFiles(directoryPath, files));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    return jsonNoStore(await deleteExplorerFiles(await readJson(request)));
  } catch (error) {
    return jsonError(error);
  }
}
