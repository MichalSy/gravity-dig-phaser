import { listPublicFiles } from '../../../../server/editorBackend';
import { jsonError, jsonNoStore } from '../_response';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return jsonNoStore(await listPublicFiles());
  } catch (error) {
    return jsonError(error);
  }
}
