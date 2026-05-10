import { gitDiff, gitDiffFile } from '../../../../../server/editorBackend';
import { jsonError, jsonNoStore } from '../../_response';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const file = new URL(request.url).searchParams.get('file')?.trim();
    if (file) return jsonNoStore({ ok: true, file: await gitDiffFile(file) });
    return jsonNoStore(await gitDiff());
  } catch (error) {
    return jsonError(error);
  }
}
