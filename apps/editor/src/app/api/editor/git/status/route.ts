import { NextResponse } from 'next/server';
import { gitStatus } from '../../../../../server/editorBackend';
import { jsonError } from '../../_response';

export async function GET() {
  try {
    return NextResponse.json(await gitStatus());
  } catch (error) {
    return jsonError(error);
  }
}
