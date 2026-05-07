import { NextResponse } from 'next/server';
import { EditorBackendError } from '../../../server/editorBackend';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

export function jsonNoStore(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { ...noStoreHeaders, ...(init?.headers ?? {}) } });
}

export function jsonError(error: unknown) {
  const status = error instanceof EditorBackendError ? error.status : 500;
  const message = error instanceof Error ? error.message : String(error);
  return jsonNoStore({ ok: false, error: message }, { status });
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => undefined);
}
