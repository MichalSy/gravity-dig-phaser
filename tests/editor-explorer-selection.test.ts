import { describe, expect, it } from 'vitest';
import { updateExplorerSelection } from '../apps/editor/src/app/explorerSelection';

const orderedPaths = ['a', 'b', 'c', 'd', 'e'];

describe('explorer file selection', () => {
  it('selects one file and toggles independent files with Ctrl/Cmd', () => {
    const single = updateExplorerSelection({ selectedPaths: new Set(), targetPath: 'b', orderedPaths, toggle: false, range: false });
    expect([...single.selectedPaths]).toEqual(['b']);

    const added = updateExplorerSelection({ selectedPaths: single.selectedPaths, anchorPath: single.anchorPath, targetPath: 'd', orderedPaths, toggle: true, range: false });
    expect([...added.selectedPaths]).toEqual(['b', 'd']);

    const removed = updateExplorerSelection({ selectedPaths: added.selectedPaths, anchorPath: added.anchorPath, targetPath: 'b', orderedPaths, toggle: true, range: false });
    expect([...removed.selectedPaths]).toEqual(['d']);
  });

  it('selects the visible range from the anchor with Shift', () => {
    const result = updateExplorerSelection({ selectedPaths: new Set(['b']), anchorPath: 'b', targetPath: 'e', orderedPaths, toggle: false, range: true });
    expect([...result.selectedPaths]).toEqual(['b', 'c', 'd', 'e']);
    expect(result.anchorPath).toBe('b');
    expect(result.activePath).toBe('e');
  });

  it('adds a range to existing independent selections with Ctrl/Cmd+Shift', () => {
    const result = updateExplorerSelection({ selectedPaths: new Set(['a']), anchorPath: 'c', targetPath: 'e', orderedPaths, toggle: true, range: true });
    expect([...result.selectedPaths]).toEqual(['a', 'c', 'd', 'e']);
  });
});
