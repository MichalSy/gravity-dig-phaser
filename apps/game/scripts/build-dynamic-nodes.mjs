import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(appRoot, 'public/dynamic-nodes/src');
const outDir = path.join(appRoot, 'public/dynamic-nodes/compiled');
const tempDir = path.join(appRoot, 'node_modules/.dynamic-node-build');

await mkdir(outDir, { recursive: true });
await mkdir(tempDir, { recursive: true });

const files = (await readdir(sourceDir)).filter((file) => file.endsWith('.node.ts')).sort();
const manifest = { version: 1, nodes: [] };

for (const file of files) {
  const sourcePath = path.join(sourceDir, file);
  const source = await readFile(sourcePath, 'utf8');
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 12);
  const baseName = file.replace(/\.node\.ts$/, '');
  const entryPath = path.join(tempDir, `${baseName}.entry.ts`);
  const outfileName = `${baseName}.${hash}.js`;
  const outfile = path.join(outDir, outfileName);
  const relativeSourceImport = path.relative(tempDir, sourcePath).replaceAll(path.sep, '/');

  await writeFile(entryPath, `
import ScriptClass from './${relativeSourceImport.startsWith('.') ? relativeSourceImport : `../${relativeSourceImport}`}';

function isDynamicPropMarker(value) {
  return typeof value === 'object' && value !== null && value.__dynamicNodeProp === true;
}

const probe = new ScriptClass();
const nodeTypeId = typeof probe.id === 'string' && probe.id.length > 0 ? probe.id : '${baseName}';
const displayName = typeof probe.name === 'string' && probe.name.length > 0 ? probe.name : nodeTypeId;

function createBehavior() {
  return new ScriptClass();
}

export default { nodeTypeId, displayName, createBehavior };
export { nodeTypeId, displayName, createBehavior };
`);

  await build({
    entryPoints: [entryPath],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
    logLevel: 'silent',
    plugins: [dynamicNodeApiPlugin()],
  });

  const declaredNodeTypeId = source.match(/\bid\s*=\s*['"]([^'"]+)['"]/u)?.[1] ?? baseName;
  manifest.nodes.push({ nodeTypeId: declaredNodeTypeId, source: `public/dynamic-nodes/src/${file}`, url: `/dynamic-nodes/compiled/${outfileName}`, hash });
}

await writeFile(path.join(appRoot, 'public/dynamic-nodes/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await rm(tempDir, { recursive: true, force: true });
console.log(`Built ${manifest.nodes.length} dynamic node(s).`);

function dynamicNodeApiPlugin() {
  return {
    name: 'gravity-dig-dynamic-node-api',
    setup(build) {
      build.onResolve({ filter: /^@gravity-dig\/dynamic-node$/ }, () => ({ path: 'dynamic-node-api', namespace: 'dynamic-node-api' }));
      build.onLoad({ filter: /.*/, namespace: 'dynamic-node-api' }, () => ({
        loader: 'ts',
        contents: `
export class ScriptNode {
  log(message, ...values) {
    this.__dynamicNodeContext?.log(message, ...values);
  }
  getNode(name) {
    return this.__dynamicNodeContext?.getNode(name);
  }
  requireNode(name) {
    const node = this.__dynamicNodeContext?.requireNode(name);
    if (!node) throw new Error('Dynamic node context is not initialized');
    return node;
  }
}
function marker(value, definition) {
  return { __dynamicNodeProp: true, value, definition };
}
export const prop = {
  string: (value, options = {}) => marker(value, { type: 'String', ...options }),
  number: (value, options = {}) => marker(value, { type: 'Number', ...options }),
  boolean: (value, options = {}) => marker(value, { type: 'Boolean', ...options }),
  assetId: (value, options = {}) => marker(value, { type: 'AssetId', ...options }),
};
`,
      }));
    },
  };
}
