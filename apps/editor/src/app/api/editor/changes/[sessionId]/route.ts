import { appendChangesFromBody, clearSession, readChangeSet, removePendingProp } from '../../../../../server/editorBackend';
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

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    const body = await readJson(request);
    if (body && typeof body === 'object' && 'prop' in body) return jsonNoStore({ ok: true, changeSet: removePendingProp(sessionId, body) });
    if (body && typeof body === 'object' && (body as { all?: unknown }).all === true) {
      clearSession(sessionId);
      return jsonNoStore({ ok: true });
    }
    return jsonNoStore({ ok: false, error: 'DELETE requires either { all: true } or { target, prop }.' }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
