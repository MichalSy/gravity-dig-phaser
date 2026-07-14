export function normalizeEditorSourcePath(path: string): string {
  const normalized = path.replace(/^\/+/, '').replaceAll('\\', '/');
  if (normalized.startsWith('apps/game/src/') || normalized.startsWith('apps/game/public/')) return normalized;
  return `apps/game/src/${normalized}`;
}

export function isEditorSourcePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  const textSourcePattern = /\.(?:tsx?|jsx?|json|md|css|scss|html|ya?ml|toml|txt)$/i;
  return normalized.startsWith('apps/game/src/')
    || (normalized.startsWith('apps/game/public/') && textSourcePattern.test(normalized));
}
