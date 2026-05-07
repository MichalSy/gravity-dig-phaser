import { backendStatus } from '../../../../server/editorBackend';
import { jsonNoStore } from '../_response';

export const dynamic = 'force-dynamic';

export function GET() {
  return jsonNoStore(backendStatus());
}
