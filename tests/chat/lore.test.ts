import { describe, expect, it } from 'vitest';

import {
  activateLore,
  lorebookEntries,
  lorebookList,
  loreBudget,
  NO_FRAMING,
  savedLorebooks,
  type LoreEntry,
  type LoreOptions,
} from '@/chat/lore';

import { chatMessage, loreEntry as entry } from '../helpers/llm';

const said = (...texts: string[]) =>
  texts.map((content, index) =>
    chatMessage(`m${index}`, index % 2 ? 'assistant' : 'user', [content]),
  );

const run = (
  entries: readonly LoreEntry[],
  texts: readonly string[],
  options: Partial<LoreOptions> = {},
) =>
  activateLore(
    [{ id: 'card', entries }],
    said(...texts),
    { budget: 0, framing: NO_FRAMING, ...options },
    (text) => text.replace(/\{\{char\}\}/gi, 'Aria'),
  );

describe('当て方', () => {
  it('キーは大文字小文字を区別せず部分一致で当て、当たらない項目は送らない', () => {
    const result = run(
      [
        entry({ keys: ['castle'], content: 'A castle.' }),
        entry({ keys: ['sea'], content: 'Sea.' }),
      ],
      ['We reached the CASTLE gate.'],
    );
    expect(result.additional).toBe('A castle.');
  });

  it('case_sensitive の項目は大文字小文字を区別する', () => {
    const lore = [entry({ keys: ['Castle'], caseSensitive: true, content: 'A castle.' })];
    expect(run(lore, ['the castle']).additional).toBe('');
    expect(run(lore, ['the Castle']).additional).toBe('A castle.');
  });

  it('常時の項目はキーと無関係に当て、無効な項目は当てない', () => {
    const result = run(
      [
        entry({ constant: true, content: 'Always.' }),
        entry({ keys: ['x'], enabled: false, content: 'Off.' }),
      ],
      ['x'],
    );
    expect(result.additional).toBe('Always.');
  });

  it('第 2 のキーを持つ項目は、第 2 のキーにも当たったときだけ当てる', () => {
    const lore = [entry({ keys: ['king'], secondaryKeys: ['crown'], content: 'Crowned.' })];
    expect(run(lore, ['the king']).additional).toBe('');
    expect(run(lore, ['the king', 'and his crown']).additional).toBe('Crowned.');
  });

  it('追加条件の論理で第 2 のキーの当て方を替える（AND・NOR・NAND）', () => {
    const lore = (logic: LoreEntry['logic']) => [
      entry({ keys: ['king'], secondaryKeys: ['crown', 'sword'], logic, content: 'K.' }),
    ];
    const both = ['the king', 'crown and sword'];
    const one = ['the king', 'a crown'];
    const none = ['the king'];
    expect([both, one, none].map((texts) => run(lore('and'), texts).additional)).toEqual([
      'K.',
      '',
      '',
    ]);
    expect([both, one, none].map((texts) => run(lore('nor'), texts).additional)).toEqual([
      '',
      '',
      'K.',
    ]);
    expect([both, one, none].map((texts) => run(lore('nand'), texts).additional)).toEqual([
      '',
      'K.',
      'K.',
    ]);
  });

  it('発動率は振る数を渡したときだけ振る。振った数が発動率以上なら外す', () => {
    const lore = [entry({ constant: true, probability: 30, content: 'Rare.' })];
    expect(run(lore, []).additional).toBe('Rare.');
    expect(run(lore, [], { roll: () => 0.29 }).additional).toBe('Rare.');
    expect(run(lore, [], { roll: () => 0.3 }).additional).toBe('');
  });

  it('RAG の項目はトリガーワードを使わず、近似判定で当たったときだけ当てる', () => {
    const lore = [
      entry({ keys: ['vault'], logic: 'rag', content: 'Near.' }),
      entry({ keys: ['vault'], content: 'Keyed.' }),
    ];
    const semantic = new Map([['card', new Set([0, 1])]]);
    expect(run(lore, ['the vault']).additional).toBe('Keyed.');
    expect(run(lore, ['the treasure room'], { semantic }).additional).toBe('Near.');
  });

  it('RAG の項目は追加条件の文をキーとして使わず、発動率は掛ける', () => {
    const semantic = new Map([['card', new Set([0])]]);
    const lore = [entry({ logic: 'rag', secondaryKeys: ['宝の話のとき'], content: 'Rag.' })];
    expect(run(lore, ['x'], { semantic }).additional).toBe('Rag.');
    const rare = [entry({ logic: 'rag', probability: 30, content: 'Rare.' })];
    expect(run(rare, ['x'], { semantic, roll: () => 0.5 }).additional).toBe('');
  });

  it('見る範囲は最新のメッセージと、その前の履歴 2 件。項目の見る範囲があればそちら', () => {
    const texts = ['a dragon', 'b', 'c', 'd'];
    expect(run([entry({ keys: ['dragon'], content: 'D.' })], texts).additional).toBe('');
    expect(run([entry({ keys: ['b'], content: 'B.' })], texts).additional).toBe('B.');
    expect(run([entry({ keys: ['dragon'], content: 'D.', scanDepth: 4 })], texts).additional).toBe(
      'D.',
    );
  });

  it('辞書のトリガー検索範囲は履歴の件数で、最新のメッセージはいつも見る。項目の見る範囲が先', () => {
    const texts = ['a dragon', 'b', 'c'];
    const withDepth = (entries: readonly LoreEntry[], scanDepth: number) =>
      activateLore(
        [{ id: 'card', entries, scanDepth }],
        said(...texts),
        { budget: 0, framing: NO_FRAMING },
        (text) => text,
      ).additional;
    expect(withDepth([entry({ keys: ['dragon'], content: 'D.' })], 2)).toBe('D.');
    expect(withDepth([entry({ keys: ['dragon'], content: 'D.' })], 1)).toBe('');
    expect(withDepth([entry({ keys: ['c'], content: 'C.' })], 0)).toBe('C.');
    expect(withDepth([entry({ keys: ['b'], content: 'B.' })], 0)).toBe('');
    expect(withDepth([entry({ keys: ['dragon'], content: 'D.', scanDepth: 2 })], 3)).toBe('');
  });

  it('当たった項目の位置を返す', () => {
    const lore = [entry({ keys: ['x'], content: 'X.' }), entry({ keys: ['y'], content: 'Y.' })];
    expect([...(run(lore, ['y']).hits.get('card') ?? [])]).toEqual([1]);
  });

  it('予算は文脈長の 25%。文脈長が分からなければ上限なし', () => {
    expect(loreBudget(8000)).toBe(2000);
    expect(loreBudget(null)).toBe(0);
  });

  it('キーにも {{char}} の置き換えを掛け、空のキーは当てない', () => {
    const lore = [
      entry({ keys: ['{{char}}'], content: 'About Aria.' }),
      entry({ keys: [' '], content: 'Empty.' }),
    ];
    expect(run(lore, ['Hello Aria']).additional).toBe('About Aria.');
  });
});

describe('予算と並び', () => {
  it('予算を超えたら優先の低い方から外し、残りは順の値で並べる', () => {
    const lore = [
      entry({ constant: true, content: 'aaaa', priority: 1, order: 1 }),
      entry({ constant: true, content: 'bbbb', priority: 3, order: 3 }),
      entry({ constant: true, content: 'cccc', priority: 2, order: 2 }),
    ];
    expect(run(lore, [], { budget: 2 }).additional).toBe('cccc\n\nbbbb');
  });

  it('予算より大きい 1 項目は外し、ほかは続けて足す', () => {
    const lore = [
      entry({ constant: true, content: 'x'.repeat(40), priority: 9 }),
      entry({ constant: true, content: 'ok', priority: 1 }),
    ];
    expect(run(lore, [], { budget: 2 }).additional).toBe('ok');
  });
});

describe('置き場と包み方', () => {
  it('深さを持たない項目は追加辞書の印に、前の項目を先にまとめ、前置き・後置きで包む', () => {
    const result = run(
      [
        entry({ constant: true, content: 'After.', side: 'after', order: 1 }),
        entry({ constant: true, content: 'Before.', order: 9 }),
      ],
      [],
      { framing: { prefix: '[Lore]', suffix: '[/Lore]' } },
    );
    expect(result.additional).toBe('[Lore]\n\nBefore.\n\nAfter.\n\n[/Lore]');
    expect(run([], []).additional).toBe('');
  });

  it('深さの項目は深さと role の組ごとに 1 つの項目にまとめる', () => {
    const depth = { depth: 2, role: 'user' } as const;
    const result = run(
      [
        entry({ constant: true, content: 'One.', depth }),
        entry({ constant: true, content: 'Two.', depth }),
      ],
      [],
    );
    expect(result.additional).toBe('');
    expect(result.depthItems.map((item) => [item.role, item.content])).toEqual([
      ['user', 'One.\n\nTwo.'],
    ]);
    expect(result.depthItems[0]?.position).toMatchObject({ kind: 'depth', depth: 2 });
  });

  it('履歴先頭の項目は、送る発言の数の深さに system で入れる（最初の発言の前）', () => {
    const result = run(
      [entry({ constant: true, content: 'Top.', historyStart: true })],
      ['a', 'b'],
    );
    expect(result.additional).toBe('');
    expect(result.depthItems.map((item) => [item.role, item.content])).toEqual([
      ['system', 'Top.'],
    ]);
    expect(result.depthItems[0]?.position).toMatchObject({ kind: 'depth', depth: 3 });
  });
});

describe('出どころをまたぐ', () => {
  const sources = (...lists: (readonly [string, readonly LoreEntry[]])[]) =>
    lists.map(([id, entries]) => ({ id, entries }));
  const runAll = (list: ReturnType<typeof sources>, budget = 0) =>
    activateLore(list, said('dragon'), { budget, framing: NO_FRAMING }, (text) => text);

  it('置き場の中は出どころの順が先で、その中を順の値で並べる', () => {
    const result = runAll(
      sources(
        ['own', [entry({ keys: ['dragon'], content: 'Own.', order: 9 })]],
        ['global', [entry({ keys: ['dragon'], content: 'Global.', order: 1 })]],
      ),
    );
    expect(result.additional).toBe('Own.\n\nGlobal.');
    expect([...(result.hits.get('global') ?? [])]).toEqual([0]);
  });

  it('予算は 1 つで、先の出どころから埋める（後の出どころが外れる）', () => {
    const result = runAll(
      sources(
        ['own', [entry({ constant: true, content: 'aaaa', priority: 1 })]],
        ['global', [entry({ constant: true, content: 'bbbb', priority: 9 })]],
      ),
      1,
    );
    expect(result.additional).toBe('aaaa');
    expect(result.hits.has('global')).toBe(false);
  });

  it('予算は先に足すと決めた出どころ（プリセットのロアブック）から埋め、並びは出どころの順', () => {
    const result = activateLore(
      [
        { id: 'global', entries: [entry({ constant: true, content: 'aaaa', priority: 9 })] },
        {
          id: 'preset:p',
          entries: [entry({ constant: true, content: 'bbbb', priority: 1 })],
          budgetFirst: true,
        },
      ],
      said('dragon'),
      { budget: 1, framing: NO_FRAMING },
      (text) => text,
    );
    expect(result.additional).toBe('bbbb');
    expect(result.hits.has('global')).toBe(false);

    const both = activateLore(
      [
        { id: 'global', entries: [entry({ constant: true, content: 'Global.' })] },
        {
          id: 'preset:p',
          entries: [entry({ constant: true, content: 'Own.' })],
          budgetFirst: true,
        },
      ],
      said('dragon'),
      { budget: 0, framing: NO_FRAMING },
      (text) => text,
    );
    expect(both.additional).toBe('Global.\n\nOwn.');
  });

  it('同じ id の出どころは 1 回だけ置く', () => {
    const book = [entry({ keys: ['dragon'], content: 'Once.' })];
    expect(runAll(sources(['a', book], ['a', book])).additional).toBe('Once.');
  });
});

describe('個別追加辞書の並び', () => {
  const first = entry({ content: 'A' });
  const second = entry({ content: 'B' });

  it('カードの辞書 1 冊を決まった id で並びにし、無ければ空', () => {
    expect(lorebookList({ name: 'Book', entries: [first] })).toEqual([
      { id: 'lorebook-1', name: 'Book', entries: [first] },
    ]);
    expect(lorebookList(null)).toEqual([]);
  });

  it('切った辞書も含めてすべての項目を並べ、プリセットに書く並びからは切った印を落とす', () => {
    const books = [
      { id: 'a', name: 'A', entries: [first], off: true as const, scanDepth: 3 },
      { id: 'b', name: 'B', entries: [second] },
    ];
    expect(lorebookEntries(books)).toEqual([first, second]);
    expect(savedLorebooks(books)).toEqual([
      { id: 'a', name: 'A', entries: [first], scanDepth: 3 },
      { id: 'b', name: 'B', entries: [second] },
    ]);
  });
});
