import { describe, expect, it } from 'vitest';

import { formatPrices } from '@/components/llm/dialogs/model-price-text';
import { sortModels } from '@/components/llm/dialogs/model-sort';

import { modelDetails } from '../helpers/llm';

const prompt = (usd: number) => [{ name: 'prompt', usd, perToken: true }];

describe('モデルの並び替え', () => {
  it('費用は安い順。決まっていない（負の値）と費用の無いモデルは、向きによらず末尾', () => {
    const table = {
      cheap: modelDetails({ prices: prompt(0.000001) }),
      dear: modelDetails({ prices: prompt(0.00001) }),
      router: modelDetails({ prices: prompt(-1) }),
    };
    const models = ['router', 'none', 'dear', 'cheap'];
    expect(sortModels(models, table, { key: 'price', ascending: true })).toEqual([
      'cheap',
      'dear',
      'none',
      'router',
    ]);
    expect(sortModels(models, table, { key: 'price', ascending: false }).slice(0, 2)).toEqual([
      'dear',
      'cheap',
    ]);
  });

  it('日付は created で並べ、無いモデルは末尾', () => {
    const table = { old: modelDetails({ created: 1 }), recent: modelDetails({ created: 2 }) };
    expect(
      sortModels(['none', 'old', 'recent'], table, { key: 'created', ascending: false }),
    ).toEqual(['recent', 'old', 'none']);
  });
});

describe('費用の 1 行', () => {
  it('トークン単位は 1M あたり、負の値は変動として出す', () => {
    expect(
      formatPrices([
        { name: 'prompt', usd: 0.0000001, perToken: true },
        { name: 'web_search', usd: 0.01, perToken: false },
        { name: 'completion', usd: -1, perToken: true },
      ]),
    ).toBe('prompt $0.1/1M · web_search $0.01 · completion 変動');
  });
});
