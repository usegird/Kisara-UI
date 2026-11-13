import { describe, expect, it } from 'vitest';

import { wildcardDirectory, wildcardLabel, wildcardPath } from '@/graph/wildcards';
import { directoryTree, isUnderDirectory, splitPath } from '@/lib/path-tree';

// ─────────────────────────────
// ワイルドカードの名前の読み方と、階層の絞り込み
// ─────────────────────────────

describe('ワイルドカードの名前', () => {
  it('前後の __ を除き、最後が名前・その前が階層', () => {
    expect(wildcardPath('__color/warm__')).toBe('color/warm');
    expect(wildcardDirectory('__color/tone/warm__')).toBe('color/tone');
    expect(wildcardLabel('__color/tone/warm__')).toBe('warm');
    expect(wildcardDirectory('__animal__')).toBe('');
  });
});

describe('階層の一覧', () => {
  it('入れ子の深さと、下すべてを合わせた件数を持つ', () => {
    const tree = directoryTree(['color', 'color/tone', '', 'place']);
    expect(tree.map((entry) => [entry.path, entry.depth, entry.count])).toEqual([
      ['color', 0, 2],
      ['color/tone', 1, 1],
      ['place', 0, 1],
    ]);
  });

  it('経路を最後の / でディレクトリと名前に分ける。/ が無ければディレクトリは空', () => {
    expect(splitPath('a/b/c')).toEqual({ directory: 'a/b', label: 'c' });
    expect(splitPath('model')).toEqual({ directory: '', label: 'model' });
  });

  it('選んだ階層の下（入れ子を含む）だけを残す。空なら全部', () => {
    expect(isUnderDirectory('color/tone', 'color')).toBe(true);
    expect(isUnderDirectory('colors', 'color')).toBe(false);
    expect(isUnderDirectory('', '')).toBe(true);
  });
});
