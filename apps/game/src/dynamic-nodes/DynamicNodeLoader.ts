import type { DynamicNodeModule } from './DynamicScriptNode';

export interface DynamicNodeManifest {
  version: 1;
  nodes: DynamicNodeManifestEntry[];
}

export interface DynamicNodeManifestEntry {
  nodeTypeId?: string;
  source: string;
  url: string;
  hash: string;
}

export async function loadDynamicNodeModules(manifest: DynamicNodeManifest | undefined): Promise<DynamicNodeModule[]> {
  if (!manifest) return [];

  const modules = await Promise.all(manifest.nodes.map((entry) => loadDynamicNodeModule(entry)));
  return modules.filter((module) => module !== undefined);
}

async function loadDynamicNodeModule(entry: DynamicNodeManifestEntry): Promise<DynamicNodeModule | undefined> {
  try {
    const url = `${entry.url}${entry.url.includes('?') ? '&' : '?'}v=${encodeURIComponent(entry.hash)}`;
    const module = await import(/* @vite-ignore */ url) as { default?: DynamicNodeModule };
    if (!module.default?.nodeTypeId || typeof module.default.createBehavior !== 'function') {
      console.warn('[DynamicNode] invalid module', entry);
      return undefined;
    }
    return module.default;
  } catch (error) {
    console.warn('[DynamicNode] failed to load module', entry, error);
    return undefined;
  }
}
