import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(appRoot, 'public/scripts');
const outDir = path.join(appRoot, 'public/scripts-compiled');
const tempDir = path.join(appRoot, 'node_modules/.script-build');

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await mkdir(tempDir, { recursive: true });

const files = await findScriptFiles(sourceDir);
const manifest = { version: 1, nodes: [] };

for (const file of files) {
  const sourcePath = path.join(sourceDir, file);
  const source = await readFile(sourcePath, 'utf8');
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 12);
  const baseName = file.replace(/\.node\.tsx?$/, '').replaceAll(path.sep, '-');
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
  const sourceUrl = `public/scripts/${file.replaceAll(path.sep, '/')}`;
  manifest.nodes.push({ nodeTypeId: declaredNodeTypeId, source: sourceUrl, url: `/scripts-compiled/${outfileName}`, hash });
}

await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await rm(tempDir, { recursive: true, force: true });
console.log(`Built ${manifest.nodes.length} script node(s).`);

async function findScriptFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name);
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findScriptFiles(fullPath, relativePath));
    else if (/\.node\.tsx?$/.test(entry.name)) files.push(relativePath);
  }
  return files.sort();
}

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
  getNode(key) {
    return this.__dynamicNodeContext?.getNode(key);
  }
  requireNode(key) {
    const node = this.__dynamicNodeContext?.requireNode(key);
    if (!node) throw new Error('Dynamic node context is not initialized');
    return node;
  }
  getNodeById(instanceId) {
    return this.__dynamicNodeContext?.getNodeById(instanceId);
  }
  requireNodeById(instanceId) {
    const node = this.__dynamicNodeContext?.requireNodeById(instanceId);
    if (!node) throw new Error('Dynamic node context is not initialized');
    return node;
  }
  getNodesByName(name) {
    return this.__dynamicNodeContext?.getNodesByName(name) ?? [];
  }
  getAppVersion() {
    return this.__dynamicNodeContext?.getAppVersion() ?? '0.0.0';
  }
  emit(action) {
    this.__dynamicNodeContext?.emit(action);
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
