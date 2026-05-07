import { stageAssetUpload } from '../../../../../../server/editorBackend';
import { jsonError, jsonNoStore, readJson } from '../../../_response';


export const dynamic = 'force-dynamic';
interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    return jsonNoStore(await stageAssetUpload(sessionId, await readJson(request)));
  } catch (error) {
    return jsonError(error);
  }
}
