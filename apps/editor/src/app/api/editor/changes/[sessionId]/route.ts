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
    const url = new URL(request.url);
    const prop = url.searchParams.get('prop')?.trim();
    const nodePath = url.searchParams.getAll('nodePath').map((part) => part.trim()).filter(Boolean);
    if (prop && nodePath.length > 0) return jsonNoStore({ ok: true, changeSet: removePendingProp(sessionId, { target: { nodePath }, prop }) });

    const body = await readJson(request);
    if (body && typeof body === 'object' && (body as { all?: unknown }).all === true) {
      clearSession(sessionId);
      return jsonNoStore({ ok: true });
    }
    return jsonNoStore({ ok: false, error: 'DELETE requires either query ?nodePath=...&prop=... or body { all: true }.' }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
