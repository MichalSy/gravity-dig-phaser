import { NextResponse } from 'next/server';
import { EditorBackendError } from '../../../server/editorBackend';

export function jsonError(error: unknown) {
  const status = error instanceof EditorBackendError ? error.status : 500;
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => undefined);
}
