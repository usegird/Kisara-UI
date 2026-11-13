import { describe, expect, it } from 'vitest';

import {
  buildModelItems,
  filterModelItems,
  formatLoraCopy,
  isModelFolderOptions,
  modelDirectories,
  modelFileIndex,
  normalizeModelName,
  normalizeModelSort,
  sortModelItems,
  usesFetchedParts,
  usesLearnText,
} from '@/graph/model-files';

import { modelFile } from '../helpers/model-files';

// ─────────────────────────────
// モデル一覧の加工。区切り文字は接続先で揺れる前提。突き合わせは正規化してから行う。
// ─────────────────────────────

const files = [
  modelFile('style\\a.safetensors'),
  modelFile('style/b.safetensors'),
  modelFile('c.safetensors'),
];
const index = modelFileIndex(files);

describe('名前の正規化', () => {
  it('区切りを揃え、先頭の ./ と重なった区切りを落とす', () => {
    expect(normalizeModelName('.\\style\\\\a.safetensors')).toBe('style/a.safetensors');
  });
});

describe('lora の選択肢かの判定', () => {
  it('拡張子を持つ選択肢がすべて一覧にあれば true', () => {
    expect(isModelFolderOptions(['style/a.safetensors', 'c.safetensors'], index)).toBe(true);
  });

  it('拡張子を持たない項目は突き合わせから外す', () => {
    expect(isModelFolderOptions(['None', 'c.safetensors'], index)).toBe(true);
  });

  it('一覧に無いものが混じれば false', () => {
    expect(isModelFolderOptions(['c.safetensors', 'other.ckpt'], index)).toBe(false);
  });

  it('一覧を取れていない・拡張子付きが 1 つも無いときは false', () => {
    expect(isModelFolderOptions(['c.safetensors'], new Map())).toBe(false);
    expect(isModelFolderOptions(['None'], index)).toBe(false);
    expect(isModelFolderOptions(null, index)).toBe(false);
  });
});

describe('カードの組み立て', () => {
  const items = buildModelItems(['style\\a.safetensors', 'c.safetensors', 'x.safetensors'], index);

  it('書き込む値は選択肢の文字列そのまま', () => {
    expect(items[0]?.value).toBe('style\\a.safetensors');
    expect(items[0]?.path).toBe('style/a.safetensors');
  });

  it('名前は拡張子とディレクトリを落とす', () => {
    expect(items.map((item) => item.label)).toEqual(['a', 'c', 'x']);
  });

  it('一覧に無い選択肢も残す（画像は出せない）', () => {
    expect(items[2]?.file).toBeNull();
  });
});

describe('ディレクトリ', () => {
  it('入れ子ごとに件数を積む', () => {
    const items = buildModelItems(
      ['a/b/one.safetensors', 'a/two.safetensors', 'root.safetensors'],
      new Map(),
    );

    expect(modelDirectories(items)).toEqual([
      { path: 'a', label: 'a', depth: 0, count: 2 },
      { path: 'a/b', label: 'b', depth: 1, count: 1 },
    ]);
  });
});

describe('絞り込みと並べ替え', () => {
  const items = buildModelItems(
    ['a/one.safetensors', 'a/b/two.safetensors', 'three.safetensors'],
    new Map(),
  );

  it('ディレクトリはその下すべてを含む', () => {
    const shown = filterModelItems(items, { directory: 'a', query: '' });
    expect(shown.map((item) => item.label)).toEqual(['one', 'two']);
  });

  it('絞り込みは経路も含めて大文字小文字を無視する', () => {
    expect(filterModelItems(items, { directory: '', query: 'A/B' })).toHaveLength(1);
  });

  it('空白で区切った語はどれかに一致すれば残す（OR）', () => {
    const shown = filterModelItems(items, { directory: '', query: 'one three' });
    expect(shown.map((item) => item.label)).toEqual(['one', 'three']);
  });

  it('日時を持たないものは名前の順に落とす', () => {
    const sorted = sortModelItems(items, 'modified', false);
    expect(sorted.map((item) => item.path)).toEqual([
      'a/b/two.safetensors',
      'a/one.safetensors',
      'three.safetensors',
    ]);
  });

  it('日時を持つものは新しい順にできる', () => {
    const dated = buildModelItems(
      ['old.safetensors', 'new.safetensors'],
      modelFileIndex([
        modelFile('old.safetensors', { modified: 100 }),
        modelFile('new.safetensors', { modified: 200 }),
      ]),
    );

    expect(sortModelItems(dated, 'modified', false).map((item) => item.label)).toEqual([
      'new',
      'old',
    ]);
  });
});

describe('並び替えの条件の読み直し', () => {
  it('残した並びと昇降をそのまま戻す', () => {
    expect(normalizeModelSort({ key: 'modified', ascending: false })).toEqual({
      key: 'modified',
      ascending: false,
    });
  });

  it('知らない並び・壊れた値は名前の昇順に落とす', () => {
    expect(normalizeModelSort({ key: 'rating', ascending: 'yes' })).toEqual({
      key: 'name',
      ascending: true,
    });
    expect(normalizeModelSort(null)).toEqual({ key: 'name', ascending: true });
  });
});

describe('Lora の写し取り', () => {
  it('既定の書式は名前（拡張子なし・ディレクトリあり）と学習で多かった語', () => {
    expect(formatLoraCopy('', 'style/foo.v2.safetensors', ['a', 'b'])).toBe(
      '<lora:style/foo.v2:1> a, b',
    );
  });

  it('学習で多かった語が無ければ、置き換えの前後の空白を詰める', () => {
    expect(formatLoraCopy('[learntext] <lora:[loraname]:0.8>', 'bar', [])).toBe('<lora:bar:0.8>');
  });

  it('[memo] はメモの前後の空白を落として入れ、無ければ詰める', () => {
    expect(formatLoraCopy('<lora:[loraname]:1> [memo]', 'a.safetensors', [], ' x\ny\n')).toBe(
      '<lora:a:1> x\ny',
    );
    expect(formatLoraCopy('[memo] <lora:[loraname]:1>', 'a.safetensors', [], '')).toBe(
      '<lora:a:1>',
    );
  });

  it('[memo] を含む書式だけ、接続先から取りに行く', () => {
    expect(usesFetchedParts('<lora:[loraname]:1> [memo]')).toBe(true);
    expect(usesFetchedParts('<lora:[loraname]:1>')).toBe(false);
  });

  it('語を使わない書式なら metadata は要らない', () => {
    expect(usesLearnText('<lora:[loraname]:1>')).toBe(false);
    expect(usesLearnText('')).toBe(true);
  });
});
