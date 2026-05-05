export function GET(): Response {
  return Response.json({ ok: true, service: 'gravity-dig-debug-editor' });
}
