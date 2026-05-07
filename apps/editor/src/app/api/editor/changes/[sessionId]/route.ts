import { appendChangesFromBody, clearSession, readChangeSet } from '../../../../../server/editorBackend';
import { jsonError, jsonNoStore, readJson } from '../../_response';


export const dynamic = 'force-dynamic';
interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  return jsonNoStore(readChangeSet(sessionId));
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const result = appendChangesFromBody(sessionId, await readJson(request));
    return jsonNoStore({ ok: true, ...result });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  clearSession(sessionId);
  return jsonNoStore({ ok: true });
}
