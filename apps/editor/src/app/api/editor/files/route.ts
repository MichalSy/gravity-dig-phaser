import { readEditorFile, writeEditorFile } from '../../../../server/editorBackend';
import { jsonError, jsonNoStore, readJson } from '../_response';


export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const path = new URL(request.url).searchParams.get('path') ?? '';
    return jsonNoStore(await readEditorFile(path));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await readJson(request) as { path?: string; content?: string } | undefined;
    if (!body?.path || typeof body.content !== 'string') return jsonNoStore({ ok: false, error: 'Required: path and content' }, { status: 400 });
    return jsonNoStore(await writeEditorFile(body.path, body.content));
  } catch (error) {
    return jsonError(error);
  }
}
