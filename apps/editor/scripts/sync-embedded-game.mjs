import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const gameDist = resolve(repoRoot, 'apps/game/dist');
const embeddedGame = resolve(repoRoot, 'apps/editor/public/game');

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(gameDist))) {
  console.warn(`[editor] embedded game skipped: ${gameDist} does not exist`);
  process.exit(0);
}

await rm(embeddedGame, { recursive: true, force: true });
await mkdir(embeddedGame, { recursive: true });
await cp(gameDist, embeddedGame, { recursive: true });
await rm(resolve(embeddedGame, 'dynamic-nodes'), { recursive: true, force: true });
console.info(`[editor] embedded game synced: ${gameDist} -> ${embeddedGame}`);
