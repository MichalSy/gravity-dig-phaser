import { atlasProjectRule } from './rules/atlas-project';
import { exactImageMetadataRule, imageStemMetadataRule } from './rules/image-metadata';
import { managerDefinitionRule } from './rules/manager-definition';
import type {
  NestableFile,
  NestedFileBundle,
  NestedFileBundleResult,
  NestedFileRelation,
  NestedFileRule,
} from './types';

export const nestedFileRules: readonly NestedFileRule[] = [
  atlasProjectRule,
  managerDefinitionRule,
  exactImageMetadataRule,
  imageStemMetadataRule,
];

export function buildNestedFileBundles<T extends NestableFile>(
  files: readonly T[],
  rules: readonly NestedFileRule[] = nestedFileRules,
): NestedFileBundleResult<T> {
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const candidatesByChild = new Map<string, NestedFileRelation[]>();

  for (const relation of rules.flatMap((rule) => rule.resolve(files))) {
    if (relation.primaryPath === relation.childPath || !filesByPath.has(relation.primaryPath) || !filesByPath.has(relation.childPath)) continue;
    const candidates = candidatesByChild.get(relation.childPath) ?? [];
    candidates.push(relation);
    candidatesByChild.set(relation.childPath, candidates);
  }

  const accepted: NestedFileRelation[] = [];
  const conflictedChildPaths = new Set<string>();
  for (const [childPath, candidates] of candidatesByChild) {
    const highestPriority = Math.max(...candidates.map(({ priority }) => priority));
    const strongest = candidates.filter(({ priority }) => priority === highestPriority);
    const primaryPaths = new Set(strongest.map(({ primaryPath }) => primaryPath));
    if (primaryPaths.size !== 1) {
      conflictedChildPaths.add(childPath);
      continue;
    }
    accepted.push([...strongest].sort(compareRelations)[0]);
  }

  const childrenByPrimary = new Map<string, NestedFileRelation[]>();
  for (const relation of accepted) {
    const children = childrenByPrimary.get(relation.primaryPath) ?? [];
    children.push(relation);
    childrenByPrimary.set(relation.primaryPath, children);
  }

  const bundles: NestedFileBundle<T>[] = [];
  for (const [primaryPath, relations] of childrenByPrimary) {
    const primary = filesByPath.get(primaryPath);
    if (!primary) continue;
    bundles.push({
      primary,
      children: relations.sort(compareRelations).map((relation) => ({
        file: filesByPath.get(relation.childPath)!,
        ruleId: relation.ruleId,
        label: relation.label,
        order: relation.order,
      })),
    });
  }

  bundles.sort((left, right) => left.primary.name.localeCompare(right.primary.name, undefined, { numeric: true, sensitivity: 'base' }));
  return {
    bundles,
    bundledChildPaths: new Set(accepted.map(({ childPath }) => childPath)),
    conflictedChildPaths,
  };
}

function compareRelations(left: NestedFileRelation, right: NestedFileRelation): number {
  return left.order - right.order
    || right.priority - left.priority
    || left.childPath.localeCompare(right.childPath, undefined, { numeric: true, sensitivity: 'base' });
}

export * from './rule-builders';
export type * from './types';
