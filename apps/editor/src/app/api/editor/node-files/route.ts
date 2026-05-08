import { listNodeFiles } from '../../../../server/editorBackend';
import { jsonError, jsonNoStore } from '../_response';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return jsonNoStore(await listNodeFiles());
  } catch (error) {
    return jsonError(error);
  }
}
