import { describe, expect, it } from 'vitest';

import { wildcardDirectory, wildcardLabel, wildcardPath } from '@/graph/wildcards';
import {
  directoryTree,
  isUnderDirectory,
  pathTreeRows,
  splitPath,
  visibleTreeRows,
} from '@/lib/path-tree';

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

describe('階層とワイルドカードの木', () => {
  it('各階層の直後に子の階層、続けてその階層の末端を並べ、根の直下の末端は最後に置く', () => {
    const names = [
      '__weather__',
      '__color/warm__',
      '__color/tone/pale__',
      '__animal__',
      '__color__',
    ];
    const paths = names.map(wildcardPath);
    const rows = pathTreeRows(
      directoryTree(paths.map((path) => splitPath(path).directory)),
      names.map((name) => ({ key: name, path: wildcardPath(name) })),
    );
    expect(rows.map((row) => `${row.kind}:${row.path}:${String(row.depth)}`)).toEqual([
      'directory:color:0',
      'directory:color/tone:1',
      'leaf:color/tone/pale:2',
      'leaf:color/warm:1',
      'leaf:animal:0',
      'leaf:color:0',
      'leaf:weather:0',
    ]);
  });
});

describe('閉じた階層の下を隠す', () => {
  it('親の階層がすべて開いている行だけを残す', () => {
    const names = ['__color/tone/pale__', '__color/warm__', '__animal__'];
    const rows = pathTreeRows(
      directoryTree(names.map((name) => splitPath(wildcardPath(name)).directory)),
      names.map((name) => ({ key: name, path: wildcardPath(name) })),
    );
    const shown = (open: string[]): string[] =>
      visibleTreeRows(rows, (path) => open.includes(path)).map((row) => row.path);

    expect(shown([])).toEqual(['color', 'animal']);
    expect(shown(['color'])).toEqual(['color', 'color/tone', 'color/warm', 'animal']);
    expect(shown(['color/tone'])).toEqual(['color', 'animal']);
  });
});
