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
const tempEntryPath = path.join(tempDir, 'dynamic-nodes.entry.ts');
const tempOutfileName = 'dynamic-nodes.build.js';
const tempOutfile = path.join(outDir, tempOutfileName);
const scriptEntries = [];

for (const [index, file] of files.entries()) {
  const sourcePath = path.join(sourceDir, file);
  const source = await readFile(sourcePath, 'utf8');
  const baseName = file.replace(/\.node\.tsx?$/, '').replaceAll(path.sep, '-');
  const declaredNodeTypeId = source.match(/\bid\s*=\s*['"]([^'"]+)['"]/u)?.[1] ?? baseName;
  const sourceUrl = `public/scripts/${file.replaceAll(path.sep, '/')}`;
  const relativeSourceImport = path.relative(tempDir, sourcePath).replaceAll(path.sep, '/');
  const importPath = relativeSourceImport.startsWith('.') ? relativeSourceImport : `../${relativeSourceImport}`;

  scriptEntries.push({ index, importPath, baseName, declaredNodeTypeId, sourceUrl });
}

await writeFile(tempEntryPath, `${scriptEntries.map((entry) => `import ScriptClass${entry.index} from './${entry.importPath}';`).join('\n')}

function createDynamicNodeModule(ScriptClass, baseName) {
  const probe = new ScriptClass();
  const nodeTypeId = typeof probe.id === 'string' && probe.id.length > 0 ? probe.id : baseName;
  const displayName = typeof probe.name === 'string' && probe.name.length > 0 ? probe.name : nodeTypeId;
  return {
    nodeTypeId,
    displayName,
    createBehavior() {
      return new ScriptClass();
    },
  };
}

const modules = [
${scriptEntries.map((entry) => `  createDynamicNodeModule(ScriptClass${entry.index}, '${entry.baseName}')`).join(',\n')}
];

export default { modules };
export { modules };
`);

await build({
  entryPoints: [tempEntryPath],
  outfile: tempOutfile,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  logLevel: 'silent',
  plugins: [dynamicNodeApiPlugin()],
});

const bundledSource = await readFile(tempOutfile, 'utf8');
const hash = createHash('sha256').update(bundledSource).digest('hex').slice(0, 12);
const outfileName = `dynamic-nodes.${hash}.js`;
const outfile = path.join(outDir, outfileName);
const bundledSourceMap = await readFile(`${tempOutfile}.map`, 'utf8');
const bundleUrl = `/scripts-compiled/${outfileName}`;
const manifest = {
  version: 1,
  bundle: { url: bundleUrl, hash },
  nodes: scriptEntries.map((entry) => ({ nodeTypeId: entry.declaredNodeTypeId, source: entry.sourceUrl, url: bundleUrl, hash })),
};

await writeFile(outfile, bundledSource.replace(`//# sourceMappingURL=${tempOutfileName}.map`, `//# sourceMappingURL=${outfileName}.map`));
await writeFile(`${outfile}.map`, bundledSourceMap.replaceAll(tempOutfileName, outfileName));
await rm(tempOutfile, { force: true });
await rm(`${tempOutfile}.map`, { force: true });
await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await rm(tempDir, { recursive: true, force: true });
console.log(`Built ${manifest.nodes.length} script node(s) into ${outfileName}.`);

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
    name: 'gravity-dig-script-node-api',
    setup(build) {
      build.onResolve({ filter: /^@gravity-dig\/game-core$/ }, () => ({ path: 'script-node-api', namespace: 'script-node-api' }));
      build.onLoad({ filter: /.*/, namespace: 'script-node-api' }, () => ({
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
  getRuntimeMode() {
    return this.__dynamicNodeContext?.getRuntimeMode() ?? 'play';
  }
  getViewportSize() {
    return this.__dynamicNodeContext?.getViewportSize() ?? { width: 1280, height: 720 };
  }
  getJsonAsset(key) {
    return this.__dynamicNodeContext?.getJsonAsset(key);
  }
  requireJsonAsset(key) {
    const value = this.getJsonAsset(key);
    if (value === undefined) throw new Error('Required JSON asset ' + key + ' is not loaded');
    return value;
  }
  instantiatePrefab(path, options) {
    const node = this.__dynamicNodeContext?.instantiatePrefab(path, options);
    if (!node) throw new Error('Dynamic node context is not initialized');
    return node;
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
  color: (value, options = {}) => marker(value, { type: 'Color', ...options }),
  nodeRef: (value = null, options = {}) => marker(value, { type: 'NodeRef', ...options }),
  nodeRefList: (value = [], options = {}) => marker(value, { type: 'NodeRefList', ...options }),
};
`,
      }));
    },
  };
}
