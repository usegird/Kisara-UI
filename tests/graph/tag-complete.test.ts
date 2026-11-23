import { describe, expect, it } from 'vitest';

import {
  canCompleteWord,
  formatTagPriority,
  matchTags,
  tagInsertText,
  tagTokenAt,
} from '@/graph/tag-complete';
import { indexTags } from '@/graph/tag-dictionary';

import { tagEntry } from '../helpers/tags';

function tags(...rows: [string, number, string[]?][]): ReturnType<typeof indexTags> {
  return indexTags(
    rows.map(([tag, priority, aliases]) => tagEntry(tag, priority, aliases)),
    null,
  );
}

describe('tagTokenAt', () => {
  it('区切りの直後からキャレットまでを語にする', () => {
    expect(tagTokenAt('1girl, smi', 10)).toEqual({ start: 7, end: 10, word: 'smi' });
    expect(tagTokenAt('(smil', 5)?.word).toBe('smil');
    expect(tagTokenAt('a\nbl', 4)?.word).toBe('bl');
  });

  it('空白を打つと、そこから先を別の語にする（全角の空白とタブも）', () => {
    expect(tagTokenAt('1girl, long ha', 14)).toEqual({ start: 12, end: 14, word: 'ha' });
    expect(tagTokenAt('猫　耳', 3)?.word).toBe('耳');
    expect(tagTokenAt('a\tbl', 4)?.word).toBe('bl');
  });

  it('\\ を付けた括弧は区切りにしない', () => {
    expect(tagTokenAt('foo\\(bar', 8)?.word).toBe('foo\\(bar');
  });

  it('語が空なら null', () => {
    expect(tagTokenAt('a, ', 3)).toBeNull();
  });

  it('@ ~ { } [ ] も空白と同じに区切り、記号は置き換える範囲から外す（記号は残る）', () => {
    expect(tagTokenAt('1girl, @wlo', 11)).toEqual({ start: 8, end: 11, word: 'wlo' });
    expect(tagTokenAt('a, @', 4)).toBeNull();
    expect(tagTokenAt('cat~smi', 7)?.word).toBe('smi');
    expect(tagTokenAt('{red|blu', 8)?.word).toBe('blu');
  });

  it(': は括弧の中でだけ区切る。外では語の一部（顔文字のタグ）', () => {
    expect(tagTokenAt('[a:smi', 6)).toEqual({ start: 3, end: 6, word: 'smi' });
    expect(tagTokenAt('(cat:1.2), {x:blu', 17)?.word).toBe('blu');
    expect(tagTokenAt('artist:wlo', 10)?.word).toBe('artist:wlo');
    expect(tagTokenAt('(a:1.1), :3', 11)?.word).toBe(':3');
    expect(tagTokenAt('\\(a:smi', 7)?.word).toBe('\\(a:smi');
  });

  it('括弧の中の Lora の書式は : で切っても当てない。閉じた後ろと別の区切りでは当てる', () => {
    expect(tagTokenAt('(<lora:nam', 10)).toBeNull();
    expect(tagTokenAt('(<lora:x:0.8> smi', 17)?.word).toBe('smi');
    expect(tagTokenAt('(<3, smi', 8)?.word).toBe('smi');
  });
});

describe('canCompleteWord', () => {
  it('2 文字から出し、全角は 1 文字から、手で開けば短くても出す', () => {
    expect(canCompleteWord('a', false)).toBe(false);
    expect(canCompleteWord('ab', false)).toBe(true);
    expect(canCompleteWord('猫', false)).toBe(true);
    expect(canCompleteWord('a', true)).toBe(true);
  });

  it('Lora・ワイルドカードの書式と重みでは出さない。頭の : は顔文字なので出す', () => {
    expect(canCompleteWord('<lora:x', false)).toBe(false);
    expect(canCompleteWord('cat:1.2', false)).toBe(false);
    expect(canCompleteWord(':3', false)).toBe(true);
    expect(canCompleteWord('__wild', false)).toBe(false);
    expect(canCompleteWord('1.2', false)).toBe(false);
    expect(canCompleteWord('1.2', true)).toBe(false);
    expect(canCompleteWord('1girl', false)).toBe(true);
  });
});

describe('matchTags', () => {
  const list = tags(
    ['blue_hair', 10],
    ['long_hair', 900],
    ['hair_ornament', 50],
    ['smile', 500, ['happy']],
  );

  it('先頭から一致を優先度順に先へ、途中に含むを後へ並べる', () => {
    const { matches, total } = matchTags(list, 'hair', 10);
    expect(matches.map((match) => match.tag.entry.tag)).toEqual([
      'hair_ornament',
      'long_hair',
      'blue_hair',
    ]);
    expect(total).toBe(3);
  });

  it('空白と _ を同じとみなし、別名で当たれば別名を返す', () => {
    expect(matchTags(list, 'long h', 10).matches[0]?.tag.entry.tag).toBe('long_hair');
    expect(matchTags(list, 'hap', 10).matches[0]?.alias).toBe('happy');
  });

  it('件数の上限で切り、当たった件数は全部を数える。空の語は全件を優先度順', () => {
    expect(matchTags(list, 'hair', 1)).toMatchObject({ total: 3 });
    expect(matchTags(list, '', 2).matches.map((match) => match.tag.entry.priority)).toEqual([
      900, 500,
    ]);
  });
});

describe('tagInsertText', () => {
  it('_ を空白にし、括弧に \\ を付け、後ろに , を足す', () => {
    expect(tagInsertText('long_hair', '')).toBe('long hair, ');
    expect(tagInsertText('saber_(fate)', '')).toBe('saber \\(fate\\), ');
  });

  it('記号だけの顔文字は変えず、直後が , なら足さない', () => {
    expect(tagInsertText('^_^', ' , next')).toBe('^_^');
  });

  it('優先度を縮めて出す', () => {
    expect([formatTagPriority(0), formatTagPriority(950), formatTagPriority(1234)]).toEqual([
      '',
      '950',
      '1.2k',
    ]);
    expect(formatTagPriority(25_000_000)).toBe('25M');
  });
});
