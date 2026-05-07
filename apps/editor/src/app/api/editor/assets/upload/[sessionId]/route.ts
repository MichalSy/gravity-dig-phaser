import { NextResponse } from 'next/server';
import { stageAssetUpload } from '../../../../../../server/editorBackend';
import { jsonError, readJson } from '../../../_response';

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { sessionId } = await context.params;
    return NextResponse.json(await stageAssetUpload(sessionId, await readJson(request)));
  } catch (error) {
    return jsonError(error);
  }
}
