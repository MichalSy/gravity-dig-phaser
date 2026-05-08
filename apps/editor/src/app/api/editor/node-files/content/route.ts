import { readNodeFile } from '../../../../../server/editorBackend';
import { jsonError, jsonNoStore } from '../../_response';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const path = new URL(request.url).searchParams.get('path') ?? '';
    return jsonNoStore(await readNodeFile(path));
  } catch (error) {
    return jsonError(error);
  }
}
