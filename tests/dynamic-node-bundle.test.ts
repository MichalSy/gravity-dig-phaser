import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');
const temporaryRoots: string[] = [];

function buildFixture(): { root: string; manifest: { bundle: { url: string; hash: string }; nodes: Array<{ nodeTypeId: string; hash: string }> } } {
  const root = mkdtempSync(join(repositoryRoot, '.dynamic-node-test-'));
  temporaryRoots.push(root);
  mkdirSync(join(root, 'public'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(join(repositoryRoot, 'apps/game/public/scripts'), join(root, 'public/scripts'), { recursive: true });
  cpSync(join(repositoryRoot, 'apps/game/scripts/build-dynamic-nodes.mjs'), join(root, 'scripts/build-dynamic-nodes.mjs'));
  execFileSync(process.execPath, ['scripts/build-dynamic-nodes.mjs'], { cwd: root, stdio: 'pipe' });
  return {
    root,
    manifest: JSON.parse(readFileSync(join(root, 'public/scripts-compiled/manifest.json'), 'utf8')),
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('canonical dynamic-node bundle', () => {
  it('bundles relative helpers, changes hash for transitive edits, and exposes every manifest module', async () => {
    const first = buildFixture();
    const helperPath = join(first.root, 'public/scripts/LevelGeneration/levelConstants.ts');
    writeFileSync(helperPath, readFileSync(helperPath, 'utf8').replace('SHIP_FLOOR_Y = 3', 'SHIP_FLOOR_Y = 4'));
    execFileSync(process.execPath, ['scripts/build-dynamic-nodes.mjs'], { cwd: first.root, stdio: 'pipe' });
    const changed = JSON.parse(readFileSync(join(first.root, 'public/scripts-compiled/manifest.json'), 'utf8')) as typeof first.manifest;

    expect(changed.bundle.hash).not.toBe(first.manifest.bundle.hash);
    expect(new Set(changed.nodes.map(({ hash }) => hash))).toEqual(new Set([changed.bundle.hash]));
    expect(changed.nodes.some(({ nodeTypeId }) => nodeTypeId === 'dynamic.level-manager')).toBe(true);

    const bundlePath = join(first.root, 'public/scripts-compiled', changed.bundle.url.split('/').at(-1)!);
    const imported = await import(`${pathToFileURL(bundlePath).href}?test=${changed.bundle.hash}`) as {
      modules: Array<{ nodeTypeId: string; createBehavior(): unknown }>;
    };
    expect(imported.modules.map(({ nodeTypeId }) => nodeTypeId).sort()).toEqual(changed.nodes.map(({ nodeTypeId }) => nodeTypeId).sort());
    expect(imported.modules.every(({ createBehavior }) => typeof createBehavior === 'function')).toBe(true);
  });
});
