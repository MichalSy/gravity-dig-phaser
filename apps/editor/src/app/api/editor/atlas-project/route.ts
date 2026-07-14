import { createAtlasProject, readAtlasProject, updateAtlasProject, uploadAtlasProjectFrame } from '../../../../server/editorBackend';
import type { AtlasCreateOptions, AtlasMutation } from '../../../../atlas-project/server';
import { jsonError, jsonNoStore, readJson } from '../_response';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const imagePath = new URL(request.url).searchParams.get('imagePath') ?? '';
    return jsonNoStore(await readAtlasProject(imagePath));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const options = await readJson(request) as AtlasCreateOptions;
    return jsonNoStore(await createAtlasProject(options));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('Atlas frame upload requires one file.');
    return jsonNoStore(await uploadAtlasProjectFrame(String(form.get('imagePath') ?? ''), {
      name: file.name,
      content: Buffer.from(await file.arrayBuffer()),
      ...(form.get('slot') !== null ? { slot: Number(form.get('slot')) } : {}),
      ...(form.get('x') !== null ? { x: Number(form.get('x')) } : {}),
      ...(form.get('y') !== null ? { y: Number(form.get('y')) } : {}),
      ...(form.get('replaceFrameId') ? { replaceFrameId: String(form.get('replaceFrameId')) } : {}),
    }));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await readJson(request) as { imagePath?: unknown; mutation?: unknown };
    if (typeof body.imagePath !== 'string' || !body.mutation || typeof body.mutation !== 'object') throw new Error('Atlas mutation is invalid.');
    return jsonNoStore(await updateAtlasProject(body.imagePath, body.mutation as AtlasMutation));
  } catch (error) {
    return jsonError(error);
  }
}
