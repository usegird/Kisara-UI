import { describe, expect, it } from 'vitest';

import { matchesAllTerms, matchesAnyTerm, rankBySearch, searchTerms } from '@/lib/search-terms';

describe('検索語', () => {
  it('空白（全角を含む）で区切り、小文字にして重複を除く', () => {
    expect(searchTerms('  Flux　detail  FLUX ')).toEqual(['flux', 'detail']);
    expect(searchTerms('   ')).toEqual([]);
  });

  it('語のどれかが含まれれば一致（OR）', () => {
    const terms = searchTerms('anime detail');
    expect(matchesAnyTerm('loras/Detail_Tweaker.safetensors', terms)).toBe(true);
    expect(matchesAnyTerm(['foo', 'ANIME style'], terms)).toBe(true);
    expect(matchesAnyTerm('realistic.safetensors', terms)).toBe(false);
  });

  it('語が無ければ常に一致', () => {
    expect(matchesAnyTerm('anything', [])).toBe(true);
  });
});

describe('すべての語を含むか（AND）', () => {
  it('語のすべてを含むものだけ一致し、語が無ければ常に一致する', () => {
    expect(matchesAllTerms('anthropic/claude-b', searchTerms('anthropic B'))).toBe(true);
    expect(matchesAllTerms('anthropic/claude-a', searchTerms('anthropic b'))).toBe(false);
    expect(matchesAllTerms('x', [])).toBe(true);
  });
});

describe('絞り込んだ結果の並び', () => {
  const rank = (query: string, names: readonly string[]): string[] =>
    rankBySearch(names, query, (name) => ({ names: [name], texts: [name] }));

  it('入力全体（途中の空白を含む）の前方一致を先に、次に当たった語の数', () => {
    const names = ['b anime', 'detail anime', 'anime detail x', 'anime'];
    expect(rank('anime detail', names)).toEqual([
      'anime detail x',
      'detail anime',
      'b anime',
      'anime',
    ]);
  });

  it('全部の語に当たるもの（AND）→ 数 → 同じ数なら先に書いた語に当たったもの', () => {
    const names = ['a dog', 'a cat', 'a bird', 'a cat dog'];
    expect(rank('cat dog', names)).toEqual(['a cat dog', 'a cat', 'a dog', 'a bird']);
    expect(rank('dog cat', names)).toEqual(['a cat dog', 'a dog', 'a cat', 'a bird']);
  });

  it('同じ順位は元の並びを保ち、入力が空なら並べ替えない', () => {
    expect(rank('z', ['b', 'a'])).toEqual(['b', 'a']);
    expect(rank('', ['b', 'a'])).toEqual(['b', 'a']);
  });
});
