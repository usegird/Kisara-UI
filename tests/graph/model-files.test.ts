import { describe, expect, it } from 'vitest';

import {
  buildModelItems,
  filterModelItems,
  formatLoraCopy,
  isModelFolderOptions,
  modelDirectories,
  modelFileIndex,
  modelNameOf,
  normalizeModelName,
  normalizeModelSort,
  sortModelItems,
  usesFetchedParts,
  usesJsonKeys,
  usesLearnText,
} from '@/graph/model-files';

import { modelFile } from '../helpers/model-files';

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

describe('Lora プロンプト書式', () => {
  it('[name] は情報の name と同じ。区切りを / に揃え、拡張子を除く', () => {
    expect(formatLoraCopy('<lora:[name]:1>', 'style\\foo.v2.safetensors')).toBe(
      '<lora:style/foo.v2:1>',
    );
    expect(modelNameOf('style\\foo.v2.safetensors')).toBe('style/foo.v2');
  });

  it('既定の書式は名前・推奨の強さ（無ければ 1）・activation text（無ければ学習で多かった語）・改行', () => {
    expect(formatLoraCopy('', 'style/foo.v2.safetensors', { learned: ['a', 'b'] })).toBe(
      '<lora:style/foo.v2:1> a, b\n',
    );
    const json = new Map([
      ['preferred weight', '0.7'],
      ['activation text', 'kisara'],
    ]);
    expect(formatLoraCopy('', 'foo.safetensors', { learned: ['a'], json })).toBe(
      '<lora:foo:0.7> kisara\n',
    );
  });

  it('既定の書式で語が空なら、空白を詰めて末尾の改行は残す', () => {
    expect(formatLoraCopy('', 'foo.safetensors')).toBe('<lora:foo:1>\n');
  });

  it('\\n の 2 字は改行にする（書式の途中でも）', () => {
    expect(formatLoraCopy('<lora:[name]:1>\\n[txt]\\n', 'a', { memo: 'x' })).toBe(
      '<lora:a:1>\nx\n',
    );
  });

  it('学習で多かった語が無ければ、置き換えの前後の空白を詰める', () => {
    expect(formatLoraCopy('[ss_tag_frequency] <lora:[name]:0.8>', 'bar')).toBe('<lora:bar:0.8>');
  });

  it('[txt] は同名の .txt の前後の空白を落として入れ、無ければ詰める', () => {
    const memo = ' x\ny\n';
    expect(formatLoraCopy('<lora:[name]:1> [txt]', 'a.safetensors', { memo })).toBe(
      '<lora:a:1> x\ny',
    );
    expect(formatLoraCopy('[txt] <lora:[name]:1>', 'a.safetensors', { memo: '' })).toBe(
      '<lora:a:1>',
    );
  });

  it('ほかの [キー] は同名の JSON のその値を前後の空白を落として入れ、無いキーは置き換えない', () => {
    const json = new Map([['activation text', ' kisara ']]);
    const format = '<lora:[name]:1> [activation text] [sd version]';

    expect(formatLoraCopy(format, 'a.safetensors', { json })).toBe(
      '<lora:a:1> kisara [sd version]',
    );
    expect(formatLoraCopy('[style] <lora:[name]:1>', 'a')).toBe('[style] <lora:a:1>');
  });

  it('キーがあって値なし（空・Unknown・0）なら空にし、前後の空白を詰める', () => {
    const json = new Map([
      ['notes', ''],
      ['sd version', 'Unknown'],
      ['strength', '0'],
    ]);
    const format = '[notes] <lora:[name]:[strength]> [sd version]';

    expect(formatLoraCopy(format, 'a', { json })).toBe('<lora:a:>');
  });
});

describe('Lora の写し取り（| の候補）', () => {
  const format = '<lora:[name]:[preferred weight|1]>';

  it('値なし・キーが無ければ次の候補へ移り、最後の名前でない候補はその文字のまま入れる', () => {
    expect(formatLoraCopy(format, 'a')).toBe('<lora:a:1>');
    expect(formatLoraCopy(format, 'a', { json: new Map([['preferred weight', '0']]) })).toBe(
      '<lora:a:1>',
    );
    expect(formatLoraCopy(format, 'a', { json: new Map([['preferred weight', '-0.5']]) })).toBe(
      '<lora:a:-0.5>',
    );
  });

  it('どの候補も空なら空にする（最後が名前なら文字のまま入れない）', () => {
    expect(formatLoraCopy('[activation text|ss_tag_frequency] <lora:[name]:1>', 'a')).toBe(
      '<lora:a:1>',
    );
  });

  it('候補の中の名前も、取りに行くものの判定に入れる', () => {
    expect(usesLearnText('[activation text|ss_tag_frequency]')).toBe(true);
    expect(usesJsonKeys('[txt|ss_tag_frequency]')).toBe(false);
    expect(usesJsonKeys('[preferred weight|1]')).toBe(true);
  });
});

describe('Lora の写し取り（取りに行くもの）', () => {
  it('決まった名前と同じキーは JSON から引かない', () => {
    const json = new Map([['txt', 'from json']]);

    expect(formatLoraCopy('[txt]', 'a', { memo: 'note', json })).toBe('note');
    expect(usesJsonKeys('<lora:[name]:1> [ss_tag_frequency] [txt]')).toBe(false);
  });

  it('[txt] を含む書式だけ、接続先から取りに行く', () => {
    expect(usesFetchedParts('<lora:[name]:1> [txt]')).toBe(true);
    expect(usesFetchedParts('<lora:[name]:1>')).toBe(false);
  });

  it('語を使わない書式なら metadata は要らない', () => {
    expect(usesLearnText('<lora:[name]:1>')).toBe(false);
    expect(usesLearnText('')).toBe(true);
  });
});
