import { describe, expect, it } from 'vitest';

import {
  applyOverrides,
  checkDictionaryName,
  DELETED_KIND,
  findDuplicateTag,
  mergeTags,
  orderDictionaries,
  parseTagRows,
  serializeTagRows,
  setOverride,
  tagKey,
} from '@/graph/tag-dictionary';

import { tagEntry as entry } from '../helpers/tags';

// ─────────────────────────────
// タグ辞書。列の数で読み分け、4 列の形で書き戻し、出どころを鍵で合わせる。
// ─────────────────────────────

describe('parseTagRows', () => {
  it('pysssss の 2 列（タグ,優先度）を読む', () => {
    const rows = parseTagRows('long_hair,5000\nblue eyes,30\n');
    expect(rows.map((row) => [row.tag, row.priority])).toEqual([
      ['long_hair', 5000],
      ['blue eyes', 30],
    ]);
  });

  it('2 列目が数でなければ別名として読む', () => {
    expect(parseTagRows('smile,happy')[0]?.aliases).toEqual(['happy']);
  });

  it('a1111 の 4 列を読み、別名を分け、null は無しとする', () => {
    const [first, second] = parseTagRows('1girl,0,100,"1girls,sole_female"\nsolo,0,50,null\n');
    expect(first?.aliases).toEqual(['1girls', 'sole_female']);
    expect(first?.kind).toBe('0');
    expect(second?.aliases).toEqual([]);
  });

  it('3 列は入れる語・別名・優先度として読み、優先度が数でなければ 0', () => {
    expect(parseTagRows('cat,neko,abc')[0]).toMatchObject({ tag: 'cat', priority: 0 });
    expect(parseTagRows('cat,neko,abc')[0]?.aliases).toEqual(['neko']);
  });

  it('BOM・空の行・タグの空の行は読まない', () => {
    expect(parseTagRows('﻿a,1\n\n ,2\nb\n').map((row) => row.tag)).toEqual(['a', 'b']);
  });

  it('書いた形を読み戻せる（区切りを含む別名・種別の補い）', () => {
    const text = serializeTagRows([{ tag: 'a,b', kind: '', priority: 3, aliases: ['x', 'y'] }]);
    expect(text).toBe('"a,b",0,3,"x,y"\n');
    expect(parseTagRows(text)[0]).toMatchObject({ tag: 'a,b', priority: 3, aliases: ['x', 'y'] });
  });
});

describe('mergeTags', () => {
  const pysssss = [entry('long_hair', 9), entry('smile', 5)];

  it('鍵は大小・_ と空白を区別しない', () => {
    expect(tagKey(' Long_Hair ')).toBe('long hair');
  });

  it('辞書の行を pysssss より、先の辞書を後の辞書より採る', () => {
    const merged = mergeTags({
      pysssss,
      dictionaries: [
        { name: 'a', entries: [entry('Long Hair', 1)] },
        { name: 'b', entries: [entry('long_hair', 2), entry('cat', 3)] },
      ],
      overrides: [],
    });
    const long = merged.find((tag) => tag.key === 'long hair');
    expect(long?.source).toBe('a');
    expect(merged.map((tag) => tag.key).sort()).toEqual(['cat', 'long hair', 'smile']);
  });

  it('上書きは pysssss の同じ鍵の行を置き換え、消す印の行は外す', () => {
    const merged = mergeTags({
      pysssss,
      dictionaries: [],
      overrides: [{ ...entry('SMILE'), kind: DELETED_KIND }, entry('long hair', 9, ['lh'])],
    });
    expect(merged.map((tag) => tag.key)).toEqual(['long hair']);
    // タグの文字は pysssss のまま、別名と優先度は上書きのもの
    expect(merged[0]?.entry).toMatchObject({ tag: pysssss[0]?.tag, priority: 9, aliases: ['lh'] });
  });

  it('上書きは辞書の行には効かない', () => {
    const merged = mergeTags({
      pysssss: [],
      dictionaries: [{ name: 'a', entries: [entry('cat', 1)] }],
      overrides: [{ ...entry('cat'), kind: DELETED_KIND }],
    });
    expect(merged.map((tag) => tag.key)).toEqual(['cat']);
  });

  it('別名が別のタグの鍵と同じならタグの方を採る', () => {
    const merged = mergeTags({
      pysssss: [entry('cat', 1, ['smile', 'neko']), entry('smile', 1)],
      dictionaries: [],
      overrides: [],
    });
    expect(merged[0]?.aliasKeys).toEqual(['', 'neko']);
  });
});

describe('直す操作', () => {
  it('同じ辞書の中で鍵の重なる最初のタグを返す', () => {
    expect(findDuplicateTag([entry('a'), entry('long_hair'), entry('Long Hair')])).toBe(
      'Long Hair',
    );
    expect(findDuplicateTag([entry('a'), entry('b')])).toBeNull();
  });

  it('上書きは元と違えば置き換え、元と同じに戻したら外す', () => {
    const original = entry('cat', 5, ['neko']);
    const edited = setOverride([entry('dog', 1)], original, entry('Cat', 7, ['neko']));
    expect(edited.map((item) => [item.tag, item.priority])).toEqual([
      ['dog', 1],
      ['cat', 7],
    ]);
    // 同じ鍵は位置を保って置き換える
    const deleted = setOverride(edited, original, { ...original, kind: DELETED_KIND });
    expect(deleted.map((item) => item.kind)).toEqual(['', DELETED_KIND]);
    expect(setOverride(deleted, original, original).map((item) => item.tag)).toEqual(['dog']);
  });

  it('上書きのファイルは辞書と同じ 4 列の形で、消す印は種別の欄に書く', () => {
    const text = serializeTagRows([{ ...entry('cat'), kind: DELETED_KIND }]);
    expect(text.trim()).toBe(`cat,${DELETED_KIND},0,`);
    expect(applyOverrides([entry('cat', 3)], parseTagRows(text))).toEqual([]);
  });

  it('辞書の名前は空・大小を問わず重なる名前を断り、ファイルの無い既定の辞書の名前も断る', () => {
    const dictionaries = [{ name: 'Mine', entries: [] }];
    expect(checkDictionaryName(dictionaries, ' ')).toBe('empty-name');
    expect(checkDictionaryName(dictionaries, 'mine')).toBe('duplicate-name');
    expect(checkDictionaryName(dictionaries, 'kisaraui')).toBe('duplicate-name');
    expect(checkDictionaryName(dictionaries, 'other')).toBeNull();
  });

  it('既定の辞書を先に、ほかは名前の順に並べる', () => {
    const ordered = orderDictionaries([
      { name: 'b', entries: [] },
      { name: 'KisaraUI', entries: [] },
      { name: 'a', entries: [] },
    ]);
    expect(ordered.map((dictionary) => dictionary.name)).toEqual(['KisaraUI', 'a', 'b']);
  });
});
