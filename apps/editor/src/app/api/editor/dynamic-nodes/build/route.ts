import { buildDynamicNodeModules } from '../../../../../server/editorBackend';
import { jsonError } from '../../_response';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const dynamicNodeBuild = await buildDynamicNodeModules();
    return Response.json({ ok: true, dynamicNodeBuild });
  } catch (error) {
    return jsonError(error);
  }
}
