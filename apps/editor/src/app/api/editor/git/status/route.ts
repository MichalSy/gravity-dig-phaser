import { gitStatus } from '../../../../../server/editorBackend';
import { jsonError, jsonNoStore } from '../../_response';


export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const refreshRemote = url.searchParams.get('remote') === '1';
    return jsonNoStore(await gitStatus({ refreshRemote }));
  } catch (error) {
    return jsonError(error);
  }
}
