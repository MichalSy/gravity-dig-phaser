import { NextResponse } from 'next/server';
import { readEditorFile, writeEditorFile } from '../../../../server/editorBackend';
import { jsonError, readJson } from '../_response';

export async function GET(request: Request) {
  try {
    const path = new URL(request.url).searchParams.get('path') ?? '';
    return NextResponse.json(await readEditorFile(path));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await readJson(request) as { path?: string; content?: string } | undefined;
    if (!body?.path || typeof body.content !== 'string') return NextResponse.json({ ok: false, error: 'Required: path and content' }, { status: 400 });
    return NextResponse.json(await writeEditorFile(body.path, body.content));
  } catch (error) {
    return jsonError(error);
  }
}
