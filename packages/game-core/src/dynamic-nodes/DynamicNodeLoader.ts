import type { DynamicNodeModule } from './DynamicScriptNode';

export interface DynamicNodeManifest {
  version: 1;
  bundle?: DynamicNodeManifestBundle;
  nodes: DynamicNodeManifestEntry[];
}

export interface DynamicNodeManifestBundle {
  url: string;
  hash: string;
}

export interface DynamicNodeManifestEntry {
  nodeTypeId?: string;
  source: string;
  url: string;
  hash: string;
}

interface DynamicNodeBundleModule {
  default?: DynamicNodeModule | { modules?: DynamicNodeModule[] };
  modules?: DynamicNodeModule[];
}

const dynamicNodeBundleCache = new Map<string, Promise<DynamicNodeModule[]>>();
const dynamicNodeCodeBundleCache = new Map<string, Promise<DynamicNodeModule[]>>();

export async function loadDynamicNodeModules(manifest: DynamicNodeManifest | undefined): Promise<DynamicNodeModule[]> {
  if (!manifest) return [];
  if (manifest.bundle) return await loadDynamicNodeBundle(manifest.bundle);

  const modules = await Promise.all(manifest.nodes.map((entry) => loadDynamicNodeModule(entry)));
  return modules.filter((module) => module !== undefined);
}

export async function loadDynamicNodeModule(entry: Pick<DynamicNodeManifestEntry, 'url' | 'hash'> & { nodeTypeId?: string }): Promise<DynamicNodeModule | undefined> {
  const modules = await loadDynamicNodeBundle(entry);
  return entry.nodeTypeId ? modules.find((module) => module.nodeTypeId === entry.nodeTypeId) : modules[0];
}

async function loadDynamicNodeBundle(entry: Pick<DynamicNodeManifestBundle, 'url' | 'hash'>): Promise<DynamicNodeModule[]> {
  const resolvedEntryUrl = resolveDynamicNodeUrl(entry.url);
  const url = `${resolvedEntryUrl}${resolvedEntryUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(entry.hash)}`;
  const cacheKey = `${url}#${entry.hash}`;
  let promise = dynamicNodeBundleCache.get(cacheKey);
  if (!promise) {
    promise = importDynamicNodeBundle(url, entry);
    dynamicNodeBundleCache.set(cacheKey, promise);
  }
  return await promise;
}

async function importDynamicNodeBundle(url: string, entry: Pick<DynamicNodeManifestBundle, 'url' | 'hash'>): Promise<DynamicNodeModule[]> {
  try {
    const module = await import(/* @vite-ignore */ url) as DynamicNodeBundleModule;
    const modules = normalizeDynamicNodeBundle(module);
    if (modules.length === 0) {
      console.warn('[DynamicNode] invalid module', entry);
      return [];
    }
    return modules;
  } catch (error) {
    console.warn('[DynamicNode] failed to load module', entry, error);
    return [];
  }
}

function normalizeDynamicNodeBundle(module: DynamicNodeBundleModule): DynamicNodeModule[] {
  if (Array.isArray(module.modules)) return module.modules.filter(isDynamicNodeModule);
  if (Array.isArray((module.default as { modules?: unknown } | undefined)?.modules)) return (module.default as { modules: unknown[] }).modules.filter(isDynamicNodeModule);
  return isDynamicNodeModule(module.default) ? [module.default] : [];
}

function isDynamicNodeModule(value: unknown): value is DynamicNodeModule {
  return typeof value === 'object'
    && value !== null
    && typeof (value as DynamicNodeModule).nodeTypeId === 'string'
    && typeof (value as DynamicNodeModule).createBehavior === 'function';
}

export async function loadDynamicNodeModuleFromCode(code: string, nodeTypeId?: string, hash?: string): Promise<DynamicNodeModule | undefined> {
  const modules = await loadDynamicNodeModulesFromCode(code, hash);
  return nodeTypeId ? modules.find((module) => module.nodeTypeId === nodeTypeId) : modules[0];
}

export async function loadDynamicNodeModulesFromCode(code: string, hash?: string): Promise<DynamicNodeModule[]> {
  const cacheKey = hash ? `hash:${hash}` : `code:${code}`;
  let promise = dynamicNodeCodeBundleCache.get(cacheKey);
  if (!promise) {
    promise = importDynamicNodeBundleFromCode(code);
    dynamicNodeCodeBundleCache.set(cacheKey, promise);
  }
  return await promise;
}

async function importDynamicNodeBundleFromCode(code: string): Promise<DynamicNodeModule[]> {
  const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    const module = await import(/* @vite-ignore */ blobUrl) as DynamicNodeBundleModule;
    const modules = normalizeDynamicNodeBundle(module);
    if (modules.length === 0) console.warn('[DynamicNode] invalid bundle from bridge response');
    return modules;
  } catch (error) {
    console.warn('[DynamicNode] failed to import bridge bundle', error);
    return [];
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function resolveDynamicNodeUrl(url: string): string {
  if (!url.startsWith('/scripts-compiled/')) return url;
  const base = import.meta.env.BASE_URL || '/';
  if (base === '/') return url;
  return `${base.replace(/\/$/u, '')}${url}`;
}
