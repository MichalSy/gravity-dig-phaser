import { clearSession, saveChangesToGit } from '../../../../../../server/editorBackend';
import { jsonError, jsonNoStore, readJson } from '../../../_response';


export const dynamic = 'force-dynamic';
interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const result = await saveChangesToGit(sessionId, await readJson(request) as { message?: string; authorName?: string; authorEmail?: string });
    if (result.saved) clearSession(sessionId);
    return jsonNoStore({ ok: true, ...result });
  } catch (error) {
    return jsonError(error);
  }
}
