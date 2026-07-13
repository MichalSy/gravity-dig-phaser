import type { NestableFile, NestedFileRelation, NestedFileRule } from './types';

interface StemSuffixRuleOptions {
  id: string;
  label: string;
  priority: number;
  order?: number;
  primarySuffixes: readonly string[];
  childSuffixes: readonly string[];
}

interface AppendedSidecarRuleOptions {
  id: string;
  label: string;
  priority: number;
  order?: number;
  primarySuffixes: readonly string[];
  appendedSuffix: string;
}

export function pairByStem(options: StemSuffixRuleOptions): NestedFileRule {
  return {
    id: options.id,
    resolve(files) {
      const fileEntries = directFiles(files);
      const primaries = indexByKey(fileEntries, options.primarySuffixes);
      const relations: NestedFileRelation[] = [];
      for (const child of fileEntries) {
        const childKey = keyWithoutSuffix(child.name, options.childSuffixes);
        if (childKey === undefined) continue;
        for (const primary of primaries.get(childKey) ?? []) {
          relations.push(relation(options, primary.path, child.path));
        }
      }
      return relations;
    },
  };
}

export function pairByAppendedSuffix(options: AppendedSidecarRuleOptions): NestedFileRule {
  return {
    id: options.id,
    resolve(files) {
      const fileEntries = directFiles(files);
      const paths = new Map(fileEntries.map((file) => [file.name, file]));
      const relations: NestedFileRelation[] = [];
      for (const primary of fileEntries) {
        if (keyWithoutSuffix(primary.name, options.primarySuffixes) === undefined) continue;
        const child = paths.get(`${primary.name}${options.appendedSuffix}`);
        if (child) relations.push(relation(options, primary.path, child.path));
      }
      return relations;
    },
  };
}

function relation(
  options: { id: string; label: string; priority: number; order?: number },
  primaryPath: string,
  childPath: string,
): NestedFileRelation {
  return {
    primaryPath,
    childPath,
    ruleId: options.id,
    label: options.label,
    priority: options.priority,
    order: options.order ?? 0,
  };
}

function directFiles(files: readonly NestableFile[]): NestableFile[] {
  return files.filter((file) => file.kind === 'file');
}

function indexByKey(files: readonly NestableFile[], suffixes: readonly string[]): Map<string, NestableFile[]> {
  const result = new Map<string, NestableFile[]>();
  for (const file of files) {
    const key = keyWithoutSuffix(file.name, suffixes);
    if (key === undefined) continue;
    const entries = result.get(key) ?? [];
    entries.push(file);
    result.set(key, entries);
  }
  return result;
}

function keyWithoutSuffix(name: string, suffixes: readonly string[]): string | undefined {
  const suffix = [...suffixes].sort((left, right) => right.length - left.length).find((candidate) => name.endsWith(candidate));
  return suffix ? name.slice(0, -suffix.length) : undefined;
}
