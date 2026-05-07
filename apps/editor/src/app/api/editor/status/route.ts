import { NextResponse } from 'next/server';
import { backendStatus } from '../../../../server/editorBackend';

export function GET() {
  return NextResponse.json(backendStatus());
}
