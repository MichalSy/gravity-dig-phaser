import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { buildAtlasProject } from '../src/atlas-project/server';
import { parseAtlasProject } from '../src/atlas-project/types';

const workspacePath = resolve(process.cwd());
const publicRoot = resolve(workspacePath, 'apps/game/public');
const metadataPaths = await findAtlasMetadata(publicRoot);
if (metadataPaths.length === 0) {
  console.log('No atlas projects found.');
  process.exit(0);
}

for (const absoluteMetadataPath of metadataPaths) {
  const metadataPath = relative(workspacePath, absoluteMetadataPath).replaceAll('\\', '/');
  const project = parseAtlasProject(JSON.parse(await readFile(absoluteMetadataPath, 'utf8')));
  const imagePath = metadataPath.replace(/\.json$/i, `.${project.output.format}`);
  const result = await buildAtlasProject(workspacePath, imagePath);
  console.log(`Built ${result.frameCount} frame(s) into ${result.imagePath} (${result.width}×${result.height}).`);
}

async function findAtlasMetadata(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const matches: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) matches.push(...await findAtlasMetadata(path));
    else if (entry.isFile() && entry.name.endsWith('.atlas.json')) matches.push(path);
  }
  return matches.sort();
}
