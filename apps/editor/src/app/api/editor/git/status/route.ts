import { gitStatus } from '../../../../../server/editorBackend';
import { jsonError, jsonNoStore } from '../../_response';


export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return jsonNoStore(await gitStatus());
  } catch (error) {
    return jsonError(error);
  }
}
