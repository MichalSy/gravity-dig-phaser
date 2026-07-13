export interface ExplorerSelectionInput {
  selectedPaths: ReadonlySet<string>;
  anchorPath?: string;
  targetPath: string;
  orderedPaths: readonly string[];
  toggle: boolean;
  range: boolean;
}

export interface ExplorerSelectionResult {
  selectedPaths: Set<string>;
  anchorPath: string;
  activePath?: string;
}

export function updateExplorerSelection(input: ExplorerSelectionInput): ExplorerSelectionResult {
  const { selectedPaths, anchorPath, targetPath, orderedPaths, toggle, range } = input;
  if (range && anchorPath) {
    const anchorIndex = orderedPaths.indexOf(anchorPath);
    const targetIndex = orderedPaths.indexOf(targetPath);
    if (anchorIndex >= 0 && targetIndex >= 0) {
      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
      const rangePaths = orderedPaths.slice(start, end + 1);
      return {
        selectedPaths: new Set(toggle ? [...selectedPaths, ...rangePaths] : rangePaths),
        anchorPath,
        activePath: targetPath,
      };
    }
  }

  if (toggle) {
    const next = new Set(selectedPaths);
    if (next.has(targetPath)) next.delete(targetPath);
    else next.add(targetPath);
    return {
      selectedPaths: next,
      anchorPath: targetPath,
      activePath: next.has(targetPath) ? targetPath : [...next].at(-1),
    };
  }

  return { selectedPaths: new Set([targetPath]), anchorPath: targetPath, activePath: targetPath };
}
