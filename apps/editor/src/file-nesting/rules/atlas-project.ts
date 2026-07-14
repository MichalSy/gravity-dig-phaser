import type { NestedFileRelation, NestedFileRule } from '../types';

export const atlasProjectRule: NestedFileRule = {
  id: 'atlas-project',
  resolve(entries) {
    const byName = new Map(entries.map((entry) => [entry.name, entry]));
    const relations: NestedFileRelation[] = [];
    for (const primary of entries) {
      if (primary.kind !== 'file') continue;
      const match = primary.name.match(/^(.*\.atlas)\.(?:png|webp)$/i);
      if (!match) continue;
      const metadata = byName.get(`${match[1]}.json`);
      if (metadata?.kind === 'file') relations.push(relation(primary.path, metadata.path, 'Atlas Metadata', 100));
      const frames = byName.get(`${match[1]}.frames`);
      if (frames?.kind === 'directory') relations.push(relation(primary.path, frames.path, 'Atlas Frames', 110));
    }
    return relations;
  },
};

function relation(primaryPath: string, childPath: string, label: string, order: number): NestedFileRelation {
  return { primaryPath, childPath, ruleId: 'atlas-project', label, priority: 120, order };
}
