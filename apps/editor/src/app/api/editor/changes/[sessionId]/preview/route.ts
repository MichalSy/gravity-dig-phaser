import { readChangeSet } from '../../../../../../server/editorBackend';
import { jsonNoStore } from '../../../_response';

export const dynamic = 'force-dynamic';
interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

export async function GET(_request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  return jsonNoStore(readChangeSet(sessionId), { headers: corsHeaders });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
