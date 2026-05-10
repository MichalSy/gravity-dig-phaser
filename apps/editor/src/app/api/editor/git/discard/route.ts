import { discardLocalChanges } from '../../../../../server/editorBackend';
import { jsonError, jsonNoStore } from '../../_response';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    return jsonNoStore(await discardLocalChanges());
  } catch (error) {
    return jsonError(error);
  }
}
